import { and, asc, desc, eq, gte, inArray, lt, or, type SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { member, product, sale, saleItem, stockMovement, user } from '@/db/schema'
import type { Db } from '@/lib/db-types'
import { limaRangeToUtc } from '@/lib/lima-time'
import type { PaymentMethod } from '@/lib/payment'
import { seesAllSales } from '@/lib/permissions'
import type { SaleStatus, SaleSummary } from '@/lib/receipt-lines'
import type { ExportRow } from '../lib/csv'
import { EXPORT_LIMIT, PAGE_SIZE, type SalesFilters, VOID_WINDOW_DAYS } from '../lib/filters'

// Todas las funciones reciben `db` (o una transacción) para probarlas con PGlite. `orgId` y el
// `viewer` salen SIEMPRE de la sesión (getCurrentMember), nunca del cliente.

export type Viewer = { userId: string; role: string }

/** Filtros + quién mira. El cajero queda limitado a sus propias ventas AQUÍ, en la capa de datos. */
export type SalesScope = { orgId: string; viewer: Viewer; filters: SalesFilters }

export class SaleError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SaleError'
  }
}
export class SaleNotFoundError extends SaleError {
  constructor() {
    super('No se encontró la venta')
    this.name = 'SaleNotFoundError'
  }
}

export type SaleListRow = {
  id: string
  series: string
  number: number
  /** ISO 8601 */
  createdAt: string
  paymentMethod: PaymentMethod
  totalCents: number
  status: SaleStatus
  cashierName: string | null
  /** Unidades vendidas (suma de cantidades). */
  itemCount: number
}

export type SalesSummary = {
  count: number
  totalCents: number
  byMethod: Record<PaymentMethod, number>
  voidedCount: number
}

export type SaleDetail = SaleSummary & {
  cashierId: string
  voidedByName: string | null
  /** Dentro de la ventana de anulación, calculado por la DB (mismo criterio que `voidSale`). */
  withinVoidWindow: boolean
}

/** Cualquier rol que no sea admin/owner se trata como cajero: ante la duda, ve menos. */
const seesAll = (viewer: Viewer) => seesAllSales(viewer.role)

/** "B001-00038" -> serie + número; "38" -> solo número. null = no se puede interpretar. */
export function parseReceiptQuery(q: string): { series?: string; number: number } | null {
  const m = /^(?:([A-Za-z]\d{3})\s*[-\s]\s*)?(\d{1,9})$/.exec(q.trim())
  if (!m) return null
  return { series: m[1]?.toUpperCase(), number: Number(m[2]) }
}

function whereOf({ orgId, viewer, filters }: SalesScope): SQL {
  const { start, end } = limaRangeToUtc(filters.from, filters.to)
  // Buscar una boleta concreta ignora las fechas: el cliente llega con una boleta de otro día
  const byDate = !filters.receipt
  const conds: (SQL | undefined)[] = [
    eq(sale.organizationId, orgId),
    byDate ? gte(sale.createdAt, start) : undefined,
    byDate ? lt(sale.createdAt, end) : undefined,
    filters.paymentMethod ? eq(sale.paymentMethod, filters.paymentMethod) : undefined,
    filters.status ? eq(sale.status, filters.status) : undefined,
  ]

  if (seesAll(viewer)) {
    if (filters.cashierId) conds.push(eq(sale.cashierId, filters.cashierId))
  } else {
    // Cajero (o rol desconocido): solo lo suyo, y se IGNORA cualquier filtro de cajero
    conds.push(eq(sale.cashierId, viewer.userId))
  }

  if (filters.productId) {
    conds.push(
      sql`exists (select 1 from ${saleItem} where ${saleItem.saleId} = ${sale.id} and ${saleItem.productId} = ${filters.productId})`,
    )
  }

  if (filters.receipt) {
    const r = parseReceiptQuery(filters.receipt)
    // Texto que no es un número de boleta: no coincide con nada
    conds.push(
      r
        ? and(r.series ? eq(sale.series, r.series) : undefined, eq(sale.number, r.number))
        : sql`false`,
    )
  }
  return and(...conds) as SQL
}

const unitsOf =
  sql<number>`coalesce((select sum(${saleItem.quantity}) from ${saleItem} where ${saleItem.saleId} = ${sale.id}), 0)`.mapWith(
    Number,
  )

/** Una página (50) de ventas, la más reciente primero. `hasNext` evita un COUNT aparte. */
export async function listSales(
  db: Db,
  { page = 1, ...scope }: SalesScope & { page?: number },
): Promise<{ rows: SaleListRow[]; page: number; hasNext: boolean }> {
  const p = Number.isInteger(page) && page >= 1 ? page : 1
  const rows = await db
    .select({
      id: sale.id,
      series: sale.series,
      number: sale.number,
      createdAt: sale.createdAt,
      paymentMethod: sale.paymentMethod,
      totalCents: sale.totalCents,
      status: sale.status,
      cashierName: user.name,
      itemCount: unitsOf,
    })
    .from(sale)
    .leftJoin(user, eq(user.id, sale.cashierId))
    .where(whereOf(scope))
    .orderBy(desc(sale.createdAt), desc(sale.id))
    .limit(PAGE_SIZE + 1)
    .offset((p - 1) * PAGE_SIZE)

  return {
    rows: rows.slice(0, PAGE_SIZE).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    page: p,
    hasNext: rows.length > PAGE_SIZE,
  }
}

/** Totales del rango: importes solo de ventas completadas; las anuladas se cuentan aparte. */
export async function salesSummary(db: Db, scope: SalesScope): Promise<SalesSummary> {
  const done = sql`${sale.status} = 'completada'`
  const num = (expr: SQL) => sql<number>`${expr}`.mapWith(Number)
  const [r] = await db
    .select({
      count: num(sql`count(*) filter (where ${done})`),
      totalCents: num(sql`coalesce(sum(${sale.totalCents}) filter (where ${done}), 0)`),
      efectivo: num(
        sql`coalesce(sum(${sale.totalCents}) filter (where ${done} and ${sale.paymentMethod} = 'efectivo'), 0)`,
      ),
      yape_plin: num(
        sql`coalesce(sum(${sale.totalCents}) filter (where ${done} and ${sale.paymentMethod} = 'yape_plin'), 0)`,
      ),
      tarjeta: num(
        sql`coalesce(sum(${sale.totalCents}) filter (where ${done} and ${sale.paymentMethod} = 'tarjeta'), 0)`,
      ),
      voidedCount: num(sql`count(*) filter (where ${sale.status} = 'anulada')`),
    })
    .from(sale)
    .where(whereOf(scope))

  return {
    count: r.count,
    totalCents: r.totalCents,
    byMethod: { efectivo: r.efectivo, yape_plin: r.yape_plin, tarjeta: r.tarjeta },
    voidedCount: r.voidedCount,
  }
}

/** Detalle completo de una venta; null si es de otra bodega o (cajero) no es suya. */
export async function getSale(
  db: Db,
  { orgId, viewer, id }: { orgId: string; viewer: Viewer; id: string },
): Promise<SaleDetail | null> {
  const voider = alias(user, 'voider')
  const [row] = await db
    .select({
      id: sale.id,
      series: sale.series,
      number: sale.number,
      createdAt: sale.createdAt,
      paymentMethod: sale.paymentMethod,
      subtotalCents: sale.subtotalCents,
      igvCents: sale.igvCents,
      totalCents: sale.totalCents,
      status: sale.status,
      voidedAt: sale.voidedAt,
      voidReason: sale.voidReason,
      cashierId: sale.cashierId,
      cashierName: user.name,
      voidedByName: voider.name,
      withinVoidWindow: sql<boolean>`${sale.createdAt} >= now() - ${windowInterval()}`,
    })
    .from(sale)
    .leftJoin(user, eq(user.id, sale.cashierId))
    .leftJoin(voider, eq(voider.id, sale.voidedById))
    .where(and(eq(sale.id, id), eq(sale.organizationId, orgId)))
    .limit(1)
  if (!row) return null
  if (!seesAll(viewer) && row.cashierId !== viewer.userId) return null

  const lines = await db
    .select({
      name: saleItem.productName,
      qty: saleItem.quantity,
      unitPriceCents: saleItem.unitPriceCents,
      lineTotalCents: saleItem.lineTotalCents,
    })
    .from(saleItem)
    .where(eq(saleItem.saleId, id))
    .orderBy(asc(saleItem.productName))

  return {
    id: row.id,
    series: row.series,
    number: row.number,
    createdAt: row.createdAt.toISOString(),
    paymentMethod: row.paymentMethod,
    lines,
    subtotalCents: row.subtotalCents,
    igvCents: row.igvCents,
    totalCents: row.totalCents,
    cashierName: row.cashierName,
    status: row.status,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidReason: row.voidReason,
    cashierId: row.cashierId,
    voidedByName: row.voidedByName,
    withinVoidWindow: row.withinVoidWindow,
  }
}

/** `interval '7 days'` sin concatenar texto: la constante se inyecta como literal verificado. */
function windowInterval(): SQL {
  return sql.raw(`interval '${Number(VOID_WINDOW_DAYS)} days'`)
}

/**
 * Anula una venta en UNA transacción: estado + movimientos inversos + caché de stock.
 *
 * - `SELECT … FOR UPDATE` de la venta (acotada por bodega): dos anulaciones simultáneas se
 *   serializan y la segunda ve `anulada`. La ventana de 7 días se compara en SQL con `now()`.
 * - El stock se devuelve a partir de los movimientos 'venta' ORIGINALES de esa venta, NO de
 *   `product.tracksStock` actual: si el producto cambió de "controla stock" después de vender, lo
 *   que se descontó (o no) en su momento es lo que se revierte. Un producto que nunca tuvo
 *   movimiento 'venta' no recibe stock de vuelta.
 * - Los productos se bloquean `FOR UPDATE` en orden de `id` (como el cobro) para no generar
 *   deadlocks, y se actualizan aunque hoy estén inactivos (siguen siendo de la bodega).
 */
export async function voidSale(
  db: Db,
  params: { orgId: string; userId: string; id: string; reason: string },
): Promise<void> {
  const { orgId, userId, id, reason } = params
  await db.transaction(async (tx) => {
    const [s] = await tx
      .select({
        status: sale.status,
        inWindow: sql<boolean>`${sale.createdAt} >= now() - ${windowInterval()}`,
      })
      .from(sale)
      .where(and(eq(sale.id, id), eq(sale.organizationId, orgId)))
      .for('update')
    if (!s) throw new SaleNotFoundError()
    if (s.status === 'anulada') throw new SaleError('La venta ya está anulada')
    if (!s.inWindow) {
      throw new SaleError(`Solo se pueden anular ventas de los últimos ${VOID_WINDOW_DAYS} días`)
    }

    const originals = await tx
      .select({ productId: stockMovement.productId, quantity: stockMovement.quantity })
      .from(stockMovement)
      .where(
        and(
          eq(stockMovement.saleId, id),
          eq(stockMovement.organizationId, orgId),
          eq(stockMovement.type, 'venta'),
        ),
      )

    // Un movimiento 'venta' por producto (el cobro los une), pero se suma por si acaso
    const restore = new Map<string, number>()
    for (const m of originals) {
      restore.set(m.productId, (restore.get(m.productId) ?? 0) - m.quantity)
    }
    const productIds = [...restore.keys()].sort()

    if (productIds.length > 0) {
      await tx
        .select({ id: product.id })
        .from(product)
        .where(and(eq(product.organizationId, orgId), inArray(product.id, productIds)))
        .orderBy(asc(product.id))
        .for('update')
    }

    await tx
      .update(sale)
      .set({
        status: 'anulada',
        voidedAt: sql`now()`,
        voidedById: userId,
        voidReason: reason,
      })
      .where(and(eq(sale.id, id), eq(sale.organizationId, orgId)))

    if (productIds.length > 0) {
      // Un solo INSERT para los movimientos inversos
      await tx.insert(stockMovement).values(
        productIds.map((productId) => ({
          organizationId: orgId,
          productId,
          type: 'anulacion' as const,
          quantity: restore.get(productId) ?? 0,
          saleId: id,
          userId,
          reason,
        })),
      )
      for (const productId of productIds) {
        await tx
          .update(product)
          .set({ stock: sql`${product.stock} + ${restore.get(productId) ?? 0}` })
          .where(and(eq(product.id, productId), eq(product.organizationId, orgId)))
      }
    }
  })
}

export type ExportResult = { rows: ExportRow[]; truncated: boolean }

/** Todas las ventas filtradas (tope 5000). `truncated` = hay más: la UI pide acotar el rango. */
export async function exportRows(db: Db, scope: SalesScope): Promise<ExportResult> {
  const found = await db
    .select({
      id: sale.id,
      series: sale.series,
      number: sale.number,
      createdAt: sale.createdAt,
      cashierName: user.name,
      paymentMethod: sale.paymentMethod,
      status: sale.status,
      subtotalCents: sale.subtotalCents,
      igvCents: sale.igvCents,
      totalCents: sale.totalCents,
      voidReason: sale.voidReason,
    })
    .from(sale)
    .leftJoin(user, eq(user.id, sale.cashierId))
    .where(whereOf(scope))
    .orderBy(desc(sale.createdAt), desc(sale.id))
    .limit(EXPORT_LIMIT + 1)

  const truncated = found.length > EXPORT_LIMIT
  const sales = found.slice(0, EXPORT_LIMIT)

  const itemsBySale = new Map<string, { name: string; qty: number }[]>()
  if (sales.length > 0) {
    const items = await db
      .select({ saleId: saleItem.saleId, name: saleItem.productName, qty: saleItem.quantity })
      .from(saleItem)
      .where(
        inArray(
          saleItem.saleId,
          sales.map((s) => s.id),
        ),
      )
      .orderBy(asc(saleItem.productName))
    for (const i of items) {
      const list = itemsBySale.get(i.saleId) ?? []
      list.push({ name: i.name, qty: i.qty })
      itemsBySale.set(i.saleId, list)
    }
  }

  return {
    truncated,
    rows: sales.map(({ id, createdAt, ...s }) => ({
      ...s,
      createdAt: createdAt.toISOString(),
      items: itemsBySale.get(id) ?? [],
    })),
  }
}

/** Productos de la bodega (también inactivos: hay ventas que los referencian) para el filtro. */
export async function listProductOptions(
  db: Db,
  orgId: string,
): Promise<{ id: string; name: string; active: boolean }[]> {
  return db
    .select({ id: product.id, name: product.name, active: product.active })
    .from(product)
    .where(eq(product.organizationId, orgId))
    .orderBy(asc(product.name))
}

/** Personas que cobraron en la bodega: miembros actuales y quienes ya tienen ventas. */
export async function listCashiers(db: Db, orgId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(
      or(
        inArray(
          user.id,
          db.select({ id: member.userId }).from(member).where(eq(member.organizationId, orgId)),
        ),
        inArray(
          user.id,
          db.select({ id: sale.cashierId }).from(sale).where(eq(sale.organizationId, orgId)),
        ),
      ),
    )
    .orderBy(asc(user.name))
}
