import { and, asc, desc, eq, gte, lt, type SQL, sql } from 'drizzle-orm'
import { product, sale, saleItem } from '@/db/schema'
import type { Db } from '@/lib/db-types'
import { addDays, LIMA_TZ, todayInLima } from '@/lib/lima-time'
import { PAYMENT_METHODS, type PaymentMethod } from '@/lib/payment'
import { can, seesAllSales } from '@/lib/permissions'
import { averageTicket, type Bucket, fillDays, fillHours, percentChange } from '../lib/metrics'
import { type DayRange, type Period, periodBounds } from '../lib/period'

// Todas las funciones reciben `db` para probarlas con PGlite. `orgId` y `viewer` salen SIEMPRE de
// la sesión (getCurrentMember). Los importes salen solo de ventas 'completada'; las anuladas se
// cuentan aparte y las pendientes (por validar) no suman dinero hasta aprobarse.

export type Viewer = { userId: string; role: string }

export const TOP_PRODUCTS_LIMIT = 5
export const STOCK_NAMES_LIMIT = 5

export type StockAlert = { count: number; names: string[] }

export type Dashboard = {
  period: Period
  /** Hoy en Lima (`YYYY-MM-DD`). */
  today: string
  range: DayRange
  previousRange: DayRange
  /** true = las cifras de ventas son solo del usuario (cajero). */
  ownSalesOnly: boolean
  totals: { totalCents: number; count: number; avgTicketCents: number }
  previous: { totalCents: number; count: number; avgTicketCents: number }
  /** Variación % contra el período previo; null = sin base de comparación. */
  changes: { total: number | null; count: number | null; avgTicket: number | null }
  byMethod: Record<PaymentMethod, number>
  /** 'hour' = 24 horas de Lima (un día); 'day' = un bucket por día (7 días). */
  buckets: { kind: 'hour' | 'day'; items: Bucket[] }
  topProducts: { productId: string; name: string; units: number; cents: number }[]
  voidedCount: number
  /** Ventas por validar de la bodega; null si el rol no puede aprobar. */
  pendingCount: number | null
  /** Ventas del período con precio editado a mano (completadas y por validar; sin anuladas) y su
   *  diferencia neta (positivo = descuento). null = el rol solo ve lo suyo (cajero). */
  editedPrices: { count: number; differenceCents: number } | null
  stock: { low: StockAlert; out: StockAlert }
}

const num = (expr: SQL) => sql<number>`${expr}`.mapWith(Number)
const done = sql`${sale.status} = 'completada'`
// Constante verificada, no un parámetro: SELECT y GROUP BY deben ver la MISMA expresión
const limaTime = sql`${sale.createdAt} at time zone ${sql.raw(`'${LIMA_TZ}'`)}`

/** Los días de `range` (inclusive) como lista `YYYY-MM-DD`. */
function daysOf(range: DayRange): string[] {
  const days: string[] = []
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) days.push(d)
  return days
}

export async function getDashboard(
  db: Db,
  params: { orgId: string; viewer: Viewer; period: Period; now?: Date },
): Promise<Dashboard> {
  const { orgId, viewer, period, now = new Date() } = params
  const today = todayInLima(now)
  const { current: cur, previous: prev, ranges } = periodBounds(period, now)
  const { current, previous } = ranges

  // El cajero queda limitado a sus propias ventas AQUÍ (mismo criterio que ventas)
  const ownSalesOnly = !seesAllSales(viewer.role)
  const scope = and(
    eq(sale.organizationId, orgId),
    ownSalesOnly ? eq(sale.cashierId, viewer.userId) : undefined,
  ) as SQL
  const inCur = and(gte(sale.createdAt, cur.start), lt(sale.createdAt, cur.end)) as SQL
  const inPrev = and(gte(sale.createdAt, prev.start), lt(sale.createdAt, prev.end)) as SQL
  const canApprove = can(viewer.role, { sale: ['approve'] })
  const kind = period === '7d' ? 'day' : 'hour'

  const trackedProducts = and(
    eq(product.organizationId, orgId),
    eq(product.active, true),
    eq(product.tracksStock, true),
  ) as SQL
  // Mismas reglas que stockStatus (src/lib/stock-status.ts), expresadas en SQL
  const isLow = and(sql`${product.stock} > 0`, sql`${product.stock} <= ${product.minStock}`) as SQL
  const isOut = sql`${product.stock} = 0`

  const [
    summaryRows,
    bucketRows,
    topRows,
    stockCounts,
    lowNames,
    outNames,
    pendingRows,
    editedRows,
  ] = await Promise.all([
    // Período actual + previo en UNA consulta (rangos contiguos)
    db
      .select({
        count: num(sql`count(*) filter (where ${done} and ${inCur})`),
        totalCents: num(
          sql`coalesce(sum(${sale.totalCents}) filter (where ${done} and ${inCur}), 0)`,
        ),
        efectivo: num(
          sql`coalesce(sum(${sale.totalCents}) filter (where ${done} and ${inCur} and ${sale.paymentMethod} = 'efectivo'), 0)`,
        ),
        yape_plin: num(
          sql`coalesce(sum(${sale.totalCents}) filter (where ${done} and ${inCur} and ${sale.paymentMethod} = 'yape_plin'), 0)`,
        ),
        tarjeta: num(
          sql`coalesce(sum(${sale.totalCents}) filter (where ${done} and ${inCur} and ${sale.paymentMethod} = 'tarjeta'), 0)`,
        ),
        voidedCount: num(sql`count(*) filter (where ${sale.status} = 'anulada' and ${inCur})`),
        prevCount: num(sql`count(*) filter (where ${done} and ${inPrev})`),
        prevTotalCents: num(
          sql`coalesce(sum(${sale.totalCents}) filter (where ${done} and ${inPrev}), 0)`,
        ),
      })
      .from(sale)
      .where(and(scope, gte(sale.createdAt, prev.start), lt(sale.createdAt, cur.end))),

    // Ventas por hora (un día) o por día (7 días), siempre en hora de Lima
    db
      .select({
        bucket:
          kind === 'hour'
            ? num(sql`extract(hour from ${limaTime})`)
            : sql<string>`to_char(${limaTime}, 'YYYY-MM-DD')`,
        cents: num(sql`sum(${sale.totalCents})`),
        count: num(sql`count(*)`),
      })
      .from(sale)
      .where(and(scope, done, inCur))
      .groupBy(
        kind === 'hour'
          ? sql`extract(hour from ${limaTime})`
          : sql`to_char(${limaTime}, 'YYYY-MM-DD')`,
      ),

    // Top productos: por unidades, desempate por importe; nombre = el snapshot más reciente
    db
      .select({
        productId: saleItem.productId,
        name: sql<string>`(array_agg(${saleItem.productName} order by ${sale.createdAt} desc))[1]`,
        units: num(sql`sum(${saleItem.quantity})`),
        cents: num(sql`sum(${saleItem.lineTotalCents})`),
      })
      .from(saleItem)
      .innerJoin(sale, eq(sale.id, saleItem.saleId))
      .where(and(scope, done, inCur))
      .groupBy(saleItem.productId)
      .orderBy(
        desc(sql`sum(${saleItem.quantity})`),
        desc(sql`sum(${saleItem.lineTotalCents})`),
        asc(saleItem.productId),
      )
      .limit(TOP_PRODUCTS_LIMIT),

    // Stock: de toda la bodega (el cajero también lo ve)
    db
      .select({
        low: num(sql`count(*) filter (where ${isLow})`),
        out: num(sql`count(*) filter (where ${isOut})`),
      })
      .from(product)
      .where(trackedProducts),
    db
      .select({ name: product.name })
      .from(product)
      .where(and(trackedProducts, isLow))
      .orderBy(asc(product.stock), asc(product.name), asc(product.id))
      .limit(STOCK_NAMES_LIMIT),
    db
      .select({ name: product.name })
      .from(product)
      .where(and(trackedProducts, isOut))
      .orderBy(asc(product.name), asc(product.id))
      .limit(STOCK_NAMES_LIMIT),

    // Por validar: de la bodega (no del período); solo si el rol puede aprobar
    canApprove
      ? db
          .select({ n: num(sql`count(*)`) })
          .from(sale)
          .where(and(eq(sale.organizationId, orgId), eq(sale.status, 'pendiente')))
      : Promise.resolve(null),

    // Precios editados: solo para quien ve las ventas de todos (el cajero no ve esta tarjeta)
    ownSalesOnly
      ? Promise.resolve(null)
      : db
          .select({
            n: num(sql`count(distinct ${sale.id})`),
            diff: num(
              sql`coalesce(sum(${saleItem.listUnitPriceCents} * ${saleItem.quantity} - ${saleItem.lineTotalCents}), 0)`,
            ),
          })
          .from(saleItem)
          .innerJoin(sale, eq(sale.id, saleItem.saleId))
          .where(
            and(
              scope,
              inCur,
              sql`${sale.status} in ('completada', 'pendiente')`,
              eq(saleItem.priceSource, 'manual'),
            ),
          ),
  ])

  const s = summaryRows[0]
  const totals = {
    totalCents: s.totalCents,
    count: s.count,
    avgTicketCents: averageTicket(s.totalCents, s.count),
  }
  const prevTotals = {
    totalCents: s.prevTotalCents,
    count: s.prevCount,
    avgTicketCents: averageTicket(s.prevTotalCents, s.prevCount),
  }

  const items =
    kind === 'hour'
      ? fillHours(
          bucketRows.map((r) => ({ hour: Number(r.bucket), cents: r.cents, count: r.count })),
        )
      : fillDays(
          daysOf(current),
          bucketRows.map((r) => ({ day: String(r.bucket), cents: r.cents, count: r.count })),
        )

  const byMethod = Object.fromEntries(PAYMENT_METHODS.map((m) => [m, s[m]])) as Record<
    PaymentMethod,
    number
  >

  return {
    period,
    today,
    range: current,
    previousRange: previous,
    ownSalesOnly,
    totals,
    previous: prevTotals,
    changes: {
      total: percentChange(totals.totalCents, prevTotals.totalCents),
      count: percentChange(totals.count, prevTotals.count),
      avgTicket: percentChange(totals.avgTicketCents, prevTotals.avgTicketCents),
    },
    byMethod,
    buckets: { kind, items },
    topProducts: topRows,
    voidedCount: s.voidedCount,
    pendingCount: pendingRows ? pendingRows[0].n : null,
    editedPrices: editedRows
      ? { count: editedRows[0].n, differenceCents: editedRows[0].diff }
      : null,
    stock: {
      low: { count: stockCounts[0].low, names: lowNames.map((r) => r.name) },
      out: { count: stockCounts[0].out, names: outNames.map((r) => r.name) },
    },
  }
}
