// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import type { PaymentMethod } from '@/lib/payment'
import { updateBusinessProfile } from '@/lib/settings'
import { PAGE_SIZE, type SalesFilters } from '../lib/filters'
import {
  approveSale,
  countPendingSales,
  exportRows,
  getSale,
  listCashiers,
  listProductOptions,
  listSales,
  parseReceiptQuery,
  SaleError,
  SaleNotFoundError,
  type SalesScope,
  salesSummary,
  type Viewer,
  voidSale,
} from './sales'

// Migraciones reales sobre Postgres en memoria (PGlite). Una sola conexión: la concurrencia real
// (FOR UPDATE de la venta y de los productos) no se puede probar aquí; las garantías son esas.
const db = drizzle(new PGlite(), { schema, casing: 'snake_case' })

const ORG_A = 'org-a'
const ORG_B = 'org-b'
const ANA = 'user-ana' // cajera
const LUIS = 'user-luis' // cajero
const ROOT = 'user-root' // administrador

const admin: Viewer = { userId: ROOT, role: 'admin' }
const ana: Viewer = { userId: ANA, role: 'cajero' }

const DAY = 24 * 3600 * 1000
const uuid = () => crypto.randomUUID()

let seq = 0

async function newProduct(
  over: Partial<typeof schema.product.$inferInsert> = {},
  orgId = ORG_A,
): Promise<string> {
  const [p] = await db
    .insert(schema.product)
    .values({
      organizationId: orgId,
      name: 'Inca Kola',
      nameKey: crypto.randomUUID(), // único por fila: los fixtures repiten `name`
      priceCents: 300,
      stock: 10,
      ...over,
    })
    .returning({ id: schema.product.id })
  return p.id
}

const stockOf = async (id: string) =>
  (await db.select().from(schema.product).where(eq(schema.product.id, id)))[0].stock

type Fixture = {
  orgId?: string
  cashierId?: string
  createdAt?: Date
  method?: PaymentMethod
  items?: { productId: string; qty: number; unitPriceCents?: number; name?: string }[]
  /** Inserta los movimientos 'venta' (lo normal). */
  movements?: boolean
  /** 'pendiente' = esperando validación (descuenta stock igual). */
  status?: 'completada' | 'pendiente'
}

/** Inserta una venta completada como la dejaría el cobro (sin pasar por caja: features aisladas). */
async function insertSale(f: Fixture = {}): Promise<string> {
  const orgId = f.orgId ?? ORG_A
  const cashierId = f.cashierId ?? ANA
  const items = f.items ?? [{ productId: await newProduct({}, orgId), qty: 1 }]
  const priced = items.map((i) => ({
    ...i,
    unit: i.unitPriceCents ?? 300,
    total: (i.unitPriceCents ?? 300) * i.qty,
  }))
  const total = priced.reduce((a, i) => a + i.total, 0)
  const igv = total - Math.round(total / 1.18)
  const id = uuid()
  await db.insert(schema.sale).values({
    id,
    organizationId: orgId,
    series: 'B001',
    number: ++seq,
    cashierId,
    status: f.status ?? 'completada',
    paymentMethod: f.method ?? 'efectivo',
    subtotalCents: total - igv,
    igvCents: igv,
    totalCents: total,
    createdAt: f.createdAt ?? new Date(),
  })
  await db.insert(schema.saleItem).values(
    priced.map((i) => ({
      saleId: id,
      productId: i.productId,
      productName: i.name ?? 'Inca Kola',
      unitPriceCents: i.unit,
      quantity: i.qty,
      lineTotalCents: i.total,
    })),
  )
  if (f.movements ?? true) {
    await db.insert(schema.stockMovement).values(
      priced.map((i) => ({
        organizationId: orgId,
        productId: i.productId,
        type: 'venta' as const,
        quantity: -i.qty,
        saleId: id,
        userId: cashierId,
      })),
    )
  }
  return id
}

/** Marca una venta como anulada directo en la DB (las de fecha fija quedan fuera de los 7 días). */
async function markVoided(id: string, reason = 'Error de cobro') {
  await db
    .update(schema.sale)
    .set({ status: 'anulada', voidedAt: new Date(), voidedById: ROOT, voidReason: reason })
    .where(eq(schema.sale.id, id))
}

const range = (from: string, to = from): SalesFilters => ({ from, to })
const scope = (filters: SalesFilters, viewer: Viewer = admin, orgId = ORG_A): SalesScope => ({
  orgId,
  viewer,
  filters,
})

// Cada describe usa un día propio y lejano para no mezclar ventas entre tests
const at = (isoLima: string) => new Date(`${isoLima}-05:00`)

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
  const now = new Date()
  await db.insert(schema.organization).values([
    { id: ORG_A, name: 'Bodega A', slug: 'a', createdAt: now },
    { id: ORG_B, name: 'Bodega B', slug: 'b', createdAt: now },
  ])
  await db.insert(schema.user).values([
    { id: ANA, name: 'Ana Rojas', email: 'ana@test.pe' },
    { id: LUIS, name: 'Luis Paz', email: 'luis@test.pe' },
    { id: ROOT, name: 'Rosa Admin', email: 'rosa@test.pe' },
  ])
  await db.insert(schema.member).values([
    { id: 'm1', organizationId: ORG_A, userId: ANA, role: 'cajero', createdAt: now },
    { id: 'm2', organizationId: ORG_A, userId: ROOT, role: 'admin', createdAt: now },
  ])
})

describe('parseReceiptQuery', () => {
  it('entiende serie-número, solo número y variantes de formato', () => {
    expect(parseReceiptQuery('B001-00038')).toEqual({ series: 'B001', number: 38 })
    expect(parseReceiptQuery('b001 38')).toEqual({ series: 'B001', number: 38 })
    expect(parseReceiptQuery('38')).toEqual({ series: undefined, number: 38 })
  })

  it('rechaza lo que no es una boleta', () => {
    expect(parseReceiptQuery('hola')).toBeNull()
    expect(parseReceiptQuery("1' or 1=1")).toBeNull()
    expect(parseReceiptQuery('99999999999')).toBeNull()
  })
})

describe('listSales: alcance', () => {
  it('solo ve ventas de su bodega', async () => {
    const day = '2026-01-05'
    const mine = await insertSale({ createdAt: at(`${day}T10:00:00`) })
    const foreign = await insertSale({ orgId: ORG_B, createdAt: at(`${day}T10:00:00`) })

    const { rows } = await listSales(db, scope(range(day)))
    const ids = rows.map((r) => r.id)
    expect(ids).toContain(mine)
    expect(ids).not.toContain(foreign)
  })

  it('el cajero solo ve las suyas, aunque pase el cashierId de otro', async () => {
    const day = '2026-01-06'
    const own = await insertSale({ cashierId: ANA, createdAt: at(`${day}T10:00:00`) })
    const other = await insertSale({ cashierId: LUIS, createdAt: at(`${day}T11:00:00`) })

    const plain = await listSales(db, scope(range(day), ana))
    expect(plain.rows.map((r) => r.id)).toEqual([own])

    const forged = await listSales(db, scope({ ...range(day), cashierId: LUIS }, ana))
    expect(forged.rows.map((r) => r.id)).toEqual([own])

    // El admin ve ambas y puede filtrar por cajero
    const all = await listSales(db, scope(range(day)))
    expect(all.rows.map((r) => r.id).sort()).toEqual([own, other].sort())
    const luis = await listSales(db, scope({ ...range(day), cashierId: LUIS }))
    expect(luis.rows.map((r) => r.id)).toEqual([other])
  })

  it('un rol desconocido se trata como cajero (ve solo lo suyo)', async () => {
    const day = '2026-01-07'
    const own = await insertSale({ cashierId: ANA, createdAt: at(`${day}T10:00:00`) })
    await insertSale({ cashierId: LUIS, createdAt: at(`${day}T11:00:00`) })
    const { rows } = await listSales(db, scope(range(day), { userId: ANA, role: 'member' }))
    expect(rows.map((r) => r.id)).toEqual([own])
  })

  it('incluye cajero, cantidad de unidades y orden más reciente primero', async () => {
    const day = '2026-01-08'
    const p = await newProduct()
    const early = await insertSale({
      createdAt: at(`${day}T08:00:00`),
      items: [{ productId: p, qty: 2 }],
    })
    const late = await insertSale({
      createdAt: at(`${day}T20:00:00`),
      method: 'tarjeta',
      items: [
        { productId: p, qty: 3 },
        { productId: await newProduct({ name: 'Pan' }), qty: 4, name: 'Pan' },
      ],
    })
    const { rows, hasNext } = await listSales(db, scope(range(day)))
    expect(rows.map((r) => r.id)).toEqual([late, early])
    expect(rows[0]).toMatchObject({
      cashierName: 'Ana Rojas',
      itemCount: 7,
      paymentMethod: 'tarjeta',
    })
    expect(rows[1].itemCount).toBe(2)
    expect(hasNext).toBe(false)
  })
})

describe('listSales: filtros', () => {
  it('filtra por producto (EXISTS en sale_item)', async () => {
    const day = '2026-01-09'
    const cola = await newProduct({ name: 'Cola' })
    const pan = await newProduct({ name: 'Pan' })
    const withCola = await insertSale({
      createdAt: at(`${day}T10:00:00`),
      items: [
        { productId: cola, qty: 1 },
        { productId: pan, qty: 1 },
      ],
    })
    const onlyPan = await insertSale({
      createdAt: at(`${day}T11:00:00`),
      items: [{ productId: pan, qty: 1 }],
    })

    const colaRows = await listSales(db, scope({ ...range(day), productId: cola }))
    expect(colaRows.rows.map((r) => r.id)).toEqual([withCola])
    const panRows = await listSales(db, scope({ ...range(day), productId: pan }))
    expect(panRows.rows.map((r) => r.id).sort()).toEqual([withCola, onlyPan].sort())
    // Un producto de otra bodega no devuelve nada
    const foreign = await newProduct({}, ORG_B)
    const none = await listSales(db, scope({ ...range(day), productId: foreign }))
    expect(none.rows).toEqual([])
  })

  it('filtra por método, estado y boleta', async () => {
    const day = '2026-01-10'
    const a = await insertSale({ createdAt: at(`${day}T10:00:00`), method: 'yape_plin' })
    const b = await insertSale({ createdAt: at(`${day}T11:00:00`), method: 'efectivo' })
    await markVoided(b)

    const yape = await listSales(db, scope({ ...range(day), paymentMethod: 'yape_plin' }))
    expect(yape.rows.map((r) => r.id)).toEqual([a])
    const voided = await listSales(db, scope({ ...range(day), status: 'anulada' }))
    expect(voided.rows.map((r) => r.id)).toEqual([b])

    const sa = (await db.select().from(schema.sale).where(eq(schema.sale.id, a)))[0]
    const byNumber = await listSales(db, scope({ ...range(day), receipt: String(sa.number) }))
    expect(byNumber.rows.map((r) => r.id)).toEqual([a])
    const byFull = await listSales(
      db,
      scope({ ...range(day), receipt: `B001-${String(sa.number).padStart(5, '0')}` }),
    )
    expect(byFull.rows.map((r) => r.id)).toEqual([a])
    // Buscar una boleta ignora el rango de fechas (el cliente trae una boleta de otro día)
    const otherDay = await listSales(
      db,
      scope({ ...range('2026-03-01'), receipt: `B001-${String(sa.number).padStart(5, '0')}` }),
    )
    expect(otherDay.rows.map((r) => r.id)).toEqual([a])
    const wrongSeries = await listSales(
      db,
      scope({ ...range(day), receipt: `B002-${String(sa.number).padStart(5, '0')}` }),
    )
    expect(wrongSeries.rows).toEqual([])
    const garbage = await listSales(db, scope({ ...range(day), receipt: "x' or '1'='1" }))
    expect(garbage.rows).toEqual([])
  })

  it('una venta anulada sigue listada, con su estado', async () => {
    const day = '2026-01-11'
    const id = await insertSale({ createdAt: at(`${day}T10:00:00`) })
    await markVoided(id)
    const { rows } = await listSales(db, scope(range(day)))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id, status: 'anulada' })
  })

  it('pagina de 50 en 50', async () => {
    const day = '2026-01-12'
    const p = await newProduct({ stock: 1000 })
    for (let i = 0; i < PAGE_SIZE + 3; i++) {
      await insertSale({
        createdAt: at(`${day}T10:${String(i % 60).padStart(2, '0')}:00`),
        items: [{ productId: p, qty: 1 }],
        movements: false,
      })
    }
    const first = await listSales(db, scope(range(day)))
    expect(first.rows).toHaveLength(PAGE_SIZE)
    expect(first.hasNext).toBe(true)
    const second = await listSales(db, { ...scope(range(day)), page: 2 })
    expect(second.rows).toHaveLength(3)
    expect(second.hasNext).toBe(false)
    const ids = new Set([...first.rows, ...second.rows].map((r) => r.id))
    expect(ids.size).toBe(PAGE_SIZE + 3)
  })
})

describe('rangos de fechas en hora de Lima', () => {
  it('una venta a las 23:30 de Lima pertenece a ese día, no al siguiente', async () => {
    // 23:30 del 14 de enero en Lima = 04:30 UTC del 15
    const id = await insertSale({ createdAt: new Date('2026-02-15T04:30:00Z') })
    const day14 = await listSales(db, scope(range('2026-02-14')))
    const day15 = await listSales(db, scope(range('2026-02-15')))
    expect(day14.rows.map((r) => r.id)).toContain(id)
    expect(day15.rows.map((r) => r.id)).not.toContain(id)
  })

  it('los límites son [00:00 de from, 00:00 del día siguiente a to)', async () => {
    const first = await insertSale({ createdAt: new Date('2026-03-10T05:00:00Z') }) // 00:00 del 10
    const justBefore = await insertSale({ createdAt: new Date('2026-03-10T04:59:59Z') }) // 23:59:59 del 9
    const last = await insertSale({ createdAt: new Date('2026-03-12T04:59:59Z') }) // 23:59:59 del 11
    const next = await insertSale({ createdAt: new Date('2026-03-12T05:00:00Z') }) // 00:00 del 12

    const ids = (await listSales(db, scope(range('2026-03-10', '2026-03-11')))).rows.map(
      (r) => r.id,
    )
    expect(ids).toContain(first)
    expect(ids).toContain(last)
    expect(ids).not.toContain(justBefore)
    expect(ids).not.toContain(next)
  })
})

describe('salesSummary', () => {
  it('suma completadas por método y cuenta las anuladas aparte', async () => {
    const day = '2026-04-01'
    const p = await newProduct({ stock: 1000 })
    const sell = (method: PaymentMethod, qty: number, hour: number) =>
      insertSale({
        createdAt: at(`${day}T${String(hour).padStart(2, '0')}:00:00`),
        method,
        items: [{ productId: p, qty }],
      })
    await sell('efectivo', 1, 9) // 300
    await sell('efectivo', 2, 10) // 600
    await sell('yape_plin', 3, 11) // 900
    await sell('tarjeta', 4, 12) // 1200
    const cancelled = await sell('tarjeta', 10, 13) // 3000, se anula
    await markVoided(cancelled)

    const s = await salesSummary(db, scope(range(day)))
    expect(s).toEqual({
      count: 4,
      totalCents: 3000,
      byMethod: { efectivo: 900, yape_plin: 900, tarjeta: 1200 },
      voidedCount: 1,
      pendingCount: 0,
      pendingTotalCents: 0,
    })
  })

  it('las pendientes no suman importes y se cuentan aparte', async () => {
    const day = '2026-04-04'
    const p = await newProduct({ stock: 1000 })
    await insertSale({ createdAt: at(`${day}T09:00:00`), items: [{ productId: p, qty: 1 }] }) // 300
    await insertSale({
      createdAt: at(`${day}T10:00:00`),
      status: 'pendiente',
      method: 'yape_plin',
      items: [{ productId: p, qty: 5 }],
    })
    const s = await salesSummary(db, scope(range(day)))
    expect(s).toEqual({
      count: 1,
      totalCents: 300,
      byMethod: { efectivo: 300, yape_plin: 0, tarjeta: 0 },
      voidedCount: 0,
      pendingCount: 1,
      pendingTotalCents: 1500,
    })
    const only = await salesSummary(db, scope({ ...range(day), status: 'pendiente' }))
    expect(only).toMatchObject({ count: 0, totalCents: 0, pendingCount: 1 })
  })

  it('sin ventas devuelve ceros', async () => {
    expect(await salesSummary(db, scope(range('2030-01-01')))).toEqual({
      count: 0,
      totalCents: 0,
      byMethod: { efectivo: 0, yape_plin: 0, tarjeta: 0 },
      voidedCount: 0,
      pendingCount: 0,
      pendingTotalCents: 0,
    })
  })

  it('el cajero solo totaliza lo suyo', async () => {
    const day = '2026-04-02'
    const p = await newProduct({ stock: 1000 })
    await insertSale({
      cashierId: ANA,
      createdAt: at(`${day}T10:00:00`),
      items: [{ productId: p, qty: 1 }],
    })
    await insertSale({
      cashierId: LUIS,
      createdAt: at(`${day}T11:00:00`),
      items: [{ productId: p, qty: 5 }],
    })
    const mine = await salesSummary(db, scope({ ...range(day), cashierId: LUIS }, ana))
    expect(mine).toMatchObject({ count: 1, totalCents: 300 })
    const all = await salesSummary(db, scope(range(day)))
    expect(all).toMatchObject({ count: 2, totalCents: 1800 })
  })

  it('con el filtro "anuladas" no suma importes', async () => {
    const day = '2026-04-03'
    const id = await insertSale({ createdAt: at(`${day}T10:00:00`) })
    await markVoided(id)
    const s = await salesSummary(db, scope({ ...range(day), status: 'anulada' }))
    expect(s).toMatchObject({ count: 0, totalCents: 0, voidedCount: 1 })
  })
})

describe('getSale', () => {
  it('devuelve el detalle completo con líneas, cajero y datos de anulación', async () => {
    const p = await newProduct({ name: 'Pan' })
    const id = await insertSale({ items: [{ productId: p, qty: 2, name: 'Pan' }] })
    const before = await getSale(db, { orgId: ORG_A, viewer: admin, id })
    expect(before).toMatchObject({
      id,
      cashierName: 'Ana Rojas',
      cashierId: ANA,
      status: 'completada',
      voidedAt: null,
      voidedByName: null,
      withinVoidWindow: true,
      lines: [{ name: 'Pan', qty: 2, unitPriceCents: 300, lineTotalCents: 600 }],
    })

    await voidSale(db, { orgId: ORG_A, userId: ROOT, id, reason: 'Producto equivocado' })
    const after = await getSale(db, { orgId: ORG_A, viewer: admin, id })
    expect(after).toMatchObject({
      status: 'anulada',
      voidedByName: 'Rosa Admin',
      voidReason: 'Producto equivocado',
    })
    expect(after?.voidedAt).toEqual(expect.any(String))
  })

  it('null si es de otra bodega, no existe o (cajero) es de otra persona', async () => {
    const id = await insertSale({ cashierId: LUIS })
    expect(await getSale(db, { orgId: ORG_B, viewer: admin, id })).toBeNull()
    expect(await getSale(db, { orgId: ORG_A, viewer: admin, id: uuid() })).toBeNull()
    expect(await getSale(db, { orgId: ORG_A, viewer: ana, id })).toBeNull()
    expect(await getSale(db, { orgId: ORG_A, viewer: admin, id })).not.toBeNull()
  })

  it('marca fuera de ventana una venta de hace más de 7 días', async () => {
    const id = await insertSale({ createdAt: new Date(Date.now() - 8 * DAY) })
    expect((await getSale(db, { orgId: ORG_A, viewer: admin, id }))?.withinVoidWindow).toBe(false)
  })
})

describe('voidSale', () => {
  it('camino feliz: estado, campos de anulación, movimientos inversos y stock devuelto', async () => {
    const cola = await newProduct({ name: 'Cola', stock: 7 })
    const pan = await newProduct({ name: 'Pan', stock: 40 })
    const id = await insertSale({
      items: [
        { productId: cola, qty: 3 },
        { productId: pan, qty: 5 },
      ],
    })

    await voidSale(db, { orgId: ORG_A, userId: ROOT, id, reason: 'Error de cobro' })

    const [s] = await db.select().from(schema.sale).where(eq(schema.sale.id, id))
    expect(s.status).toBe('anulada') // y cumple el CHECK sale_void_consistent
    expect(s.voidedById).toBe(ROOT)
    expect(s.voidedAt).toBeInstanceOf(Date)
    expect(s.voidReason).toBe('Error de cobro')

    const mv = await db
      .select()
      .from(schema.stockMovement)
      .where(eq(schema.stockMovement.saleId, id))
    const inverse = mv.filter((m) => m.type === 'anulacion')
    expect(inverse).toHaveLength(2)
    expect(inverse.every((m) => m.userId === ROOT && m.reason === 'Error de cobro')).toBe(true)
    expect(inverse.find((m) => m.productId === cola)?.quantity).toBe(3)
    expect(inverse.find((m) => m.productId === pan)?.quantity).toBe(5)
    // Los movimientos originales siguen ahí (append-only)
    expect(mv.filter((m) => m.type === 'venta')).toHaveLength(2)
    // La suma de movimientos de la venta queda en cero
    expect(mv.reduce((a, m) => a + m.quantity, 0)).toBe(0)

    expect(await stockOf(cola)).toBe(10)
    expect(await stockOf(pan)).toBe(45)
  })

  it('rechaza anular dos veces y no vuelve a tocar el stock', async () => {
    const p = await newProduct({ stock: 5 })
    const id = await insertSale({ items: [{ productId: p, qty: 2 }] })
    await voidSale(db, { orgId: ORG_A, userId: ROOT, id, reason: 'Error de cobro' })

    const err = await voidSale(db, {
      orgId: ORG_A,
      userId: ROOT,
      id,
      reason: 'Otro: de nuevo',
    }).catch((e) => e)
    expect(err).toBeInstanceOf(SaleError)
    expect(err.message).toBe('La venta ya está anulada')
    expect(await stockOf(p)).toBe(7)
    const [s] = await db.select().from(schema.sale).where(eq(schema.sale.id, id))
    expect(s.voidReason).toBe('Error de cobro')
  })

  it('rechaza ventas de hace más de 7 días y no escribe nada', async () => {
    const p = await newProduct({ stock: 5 })
    const id = await insertSale({
      createdAt: new Date(Date.now() - 8 * DAY),
      items: [{ productId: p, qty: 2 }],
    })
    const err = await voidSale(db, {
      orgId: ORG_A,
      userId: ROOT,
      id,
      reason: 'Error de cobro',
    }).catch((e) => e)
    expect(err).toBeInstanceOf(SaleError)
    expect(err.message).toBe('Solo se pueden anular ventas de los últimos 7 días')
    expect(await stockOf(p)).toBe(5)
    const [s] = await db.select().from(schema.sale).where(eq(schema.sale.id, id))
    expect(s.status).toBe('completada')
  })

  it('acepta una venta de hace 6 días', async () => {
    const p = await newProduct({ stock: 5 })
    const id = await insertSale({
      createdAt: new Date(Date.now() - 6 * DAY),
      items: [{ productId: p, qty: 2 }],
    })
    await voidSale(db, { orgId: ORG_A, userId: ROOT, id, reason: 'Error de cobro' })
    expect(await stockOf(p)).toBe(7)
  })

  it('una venta de otra bodega (o inexistente) es "no encontrada" y no se toca', async () => {
    const pB = await newProduct({ stock: 5 }, ORG_B)
    const idB = await insertSale({ orgId: ORG_B, items: [{ productId: pB, qty: 2 }] })

    const err = await voidSale(db, { orgId: ORG_A, userId: ROOT, id: idB, reason: 'X' }).catch(
      (e) => e,
    )
    expect(err).toBeInstanceOf(SaleNotFoundError)
    expect(
      await voidSale(db, { orgId: ORG_A, userId: ROOT, id: uuid(), reason: 'X' }).catch((e) => e),
    ).toBeInstanceOf(SaleNotFoundError)

    expect(await stockOf(pB)).toBe(5)
    const [s] = await db.select().from(schema.sale).where(eq(schema.sale.id, idB))
    expect(s.status).toBe('completada')
  })

  it('devuelve stock solo a productos con movimiento "venta", sin mirar el tracksStock actual', async () => {
    // Se vendió cuando NO controlaba stock (sin movimiento); luego pasó a controlarlo
    const wasUntracked = await newProduct({
      name: 'Antes sin control',
      tracksStock: false,
      stock: 0,
    })
    // Se vendió controlando stock (con movimiento); luego dejó de controlarlo
    const wasTracked = await newProduct({ name: 'Antes con control', tracksStock: true, stock: 6 })
    const id = await insertSale({
      items: [
        { productId: wasUntracked, qty: 4 },
        { productId: wasTracked, qty: 2 },
      ],
      movements: false,
    })
    await db.insert(schema.stockMovement).values({
      organizationId: ORG_A,
      productId: wasTracked,
      type: 'venta',
      quantity: -2,
      saleId: id,
      userId: ANA,
    })
    // Cambian las banderas DESPUÉS de la venta
    await db
      .update(schema.product)
      .set({ tracksStock: true, stock: 3 })
      .where(eq(schema.product.id, wasUntracked))
    await db
      .update(schema.product)
      .set({ tracksStock: false })
      .where(eq(schema.product.id, wasTracked))

    await voidSale(db, { orgId: ORG_A, userId: ROOT, id, reason: 'Error de cobro' })

    expect(await stockOf(wasUntracked)).toBe(3) // nunca se descontó: no se devuelve nada
    expect(await stockOf(wasTracked)).toBe(8) // sí se descontó: se devuelve aunque ya no controle
    const inverse = (
      await db.select().from(schema.stockMovement).where(eq(schema.stockMovement.saleId, id))
    ).filter((m) => m.type === 'anulacion')
    expect(inverse.map((m) => m.productId)).toEqual([wasTracked])
  })

  it('devuelve el stock aunque el producto esté hoy inactivo', async () => {
    const p = await newProduct({ stock: 1, active: false })
    const id = await insertSale({ items: [{ productId: p, qty: 3 }] })
    await voidSale(db, { orgId: ORG_A, userId: ROOT, id, reason: 'Error de cobro' })
    expect(await stockOf(p)).toBe(4)
  })

  it('una venta sin movimientos de stock se anula sin movimientos inversos', async () => {
    const p = await newProduct({ tracksStock: false, stock: 0 })
    const id = await insertSale({ items: [{ productId: p, qty: 2 }], movements: false })
    await voidSale(db, { orgId: ORG_A, userId: ROOT, id, reason: 'Error de cobro' })
    const mv = await db
      .select()
      .from(schema.stockMovement)
      .where(eq(schema.stockMovement.saleId, id))
    expect(mv).toEqual([])
    expect((await db.select().from(schema.sale).where(eq(schema.sale.id, id)))[0].status).toBe(
      'anulada',
    )
  })
})

describe('ventas pendientes de validación', () => {
  it('aprobar: pasa a completada, registra quién y cuándo, y NO toca el stock', async () => {
    const p = await newProduct({ stock: 10 })
    const id = await insertSale({ status: 'pendiente', items: [{ productId: p, qty: 4 }] })
    const mvBefore = await db
      .select()
      .from(schema.stockMovement)
      .where(eq(schema.stockMovement.saleId, id))

    await approveSale(db, { orgId: ORG_A, userId: ROOT, id })

    const [s] = await db.select().from(schema.sale).where(eq(schema.sale.id, id))
    expect(s.status).toBe('completada')
    expect(s.approvedById).toBe(ROOT)
    expect(s.approvedAt).toBeInstanceOf(Date)
    expect(await stockOf(p)).toBe(10) // el fixture no descuenta; aprobar tampoco debe moverlo
    const mvAfter = await db
      .select()
      .from(schema.stockMovement)
      .where(eq(schema.stockMovement.saleId, id))
    expect(mvAfter).toHaveLength(mvBefore.length)

    const detail = await getSale(db, { orgId: ORG_A, viewer: admin, id })
    expect(detail).toMatchObject({ status: 'completada', approvedByName: 'Rosa Admin' })
    expect(detail?.approvedAt).toEqual(expect.any(String))
  })

  it('aprobar dos veces o una venta ya procesada da "La venta ya fue procesada"', async () => {
    const p = await newProduct({ stock: 10 })
    const pending = await insertSale({ status: 'pendiente', items: [{ productId: p, qty: 1 }] })
    await approveSale(db, { orgId: ORG_A, userId: ROOT, id: pending })
    const again = await approveSale(db, { orgId: ORG_A, userId: ROOT, id: pending }).catch((e) => e)
    expect(again).toBeInstanceOf(SaleError)
    expect(again.message).toBe('La venta ya fue procesada')

    const done = await insertSale({ items: [{ productId: p, qty: 1 }] })
    const err = await approveSale(db, { orgId: ORG_A, userId: ROOT, id: done }).catch((e) => e)
    expect(err.message).toBe('La venta ya fue procesada')

    const voided = await insertSale({ items: [{ productId: p, qty: 1 }] })
    await markVoided(voided)
    const err2 = await approveSale(db, { orgId: ORG_A, userId: ROOT, id: voided }).catch((e) => e)
    expect(err2.message).toBe('La venta ya fue procesada')
  })

  it('nadie aprueba sus propias ventas (separación de funciones)', async () => {
    const p = await newProduct({ stock: 10 })
    const own = await insertSale({
      status: 'pendiente',
      cashierId: ROOT,
      items: [{ productId: p, qty: 1 }],
    })
    const err = await approveSale(db, { orgId: ORG_A, userId: ROOT, id: own }).catch((e) => e)
    expect(err).toBeInstanceOf(SaleError)
    expect(err.message).toBe('No puedes aprobar tus propias ventas')
    const [s] = await db.select().from(schema.sale).where(eq(schema.sale.id, own))
    expect(s.status).toBe('pendiente')
  })

  it('rechazar aborta si la venta ya no está pendiente (otro admin la aprobó)', async () => {
    const p = await newProduct({ stock: 10 })
    const id = await insertSale({ status: 'pendiente', items: [{ productId: p, qty: 1 }] })
    await approveSale(db, { orgId: ORG_A, userId: ROOT, id })
    const err = await voidSale(db, {
      orgId: ORG_A,
      userId: ROOT,
      id,
      reason: 'Error de cobro',
      expectedStatus: 'pendiente',
    }).catch((e) => e)
    expect(err).toBeInstanceOf(SaleError)
    expect(err.message).toMatch(/cambió de estado/)
    const [s] = await db.select().from(schema.sale).where(eq(schema.sale.id, id))
    expect(s.status).toBe('completada')
  })

  it('aprobar una venta de otra bodega es "no encontrada" y no la toca', async () => {
    const pB = await newProduct({ stock: 5 }, ORG_B)
    const idB = await insertSale({
      orgId: ORG_B,
      status: 'pendiente',
      items: [{ productId: pB, qty: 1 }],
    })
    const err = await approveSale(db, { orgId: ORG_A, userId: ROOT, id: idB }).catch((e) => e)
    expect(err).toBeInstanceOf(SaleNotFoundError)
    const [s] = await db.select().from(schema.sale).where(eq(schema.sale.id, idB))
    expect(s.status).toBe('pendiente')
  })

  it('rechazar (anular) una pendiente devuelve el stock y NO tiene ventana de 7 días', async () => {
    const p = await newProduct({ stock: 6 })
    const id = await insertSale({
      status: 'pendiente',
      createdAt: new Date(Date.now() - 30 * DAY),
      items: [{ productId: p, qty: 2 }],
    })
    await voidSale(db, { orgId: ORG_A, userId: ROOT, id, reason: 'Producto equivocado' })

    const [s] = await db.select().from(schema.sale).where(eq(schema.sale.id, id))
    expect(s.status).toBe('anulada')
    expect(s.voidReason).toBe('Producto equivocado')
    expect(s.approvedAt).toBeNull()
    expect(await stockOf(p)).toBe(8)
  })

  it('una completada de hace 30 días sigue fuera de la ventana', async () => {
    const p = await newProduct({ stock: 6 })
    const id = await insertSale({
      createdAt: new Date(Date.now() - 30 * DAY),
      items: [{ productId: p, qty: 2 }],
    })
    const err = await voidSale(db, { orgId: ORG_A, userId: ROOT, id, reason: 'x' }).catch((e) => e)
    expect(err).toBeInstanceOf(SaleError)
  })

  it('no se puede aprobar una venta ya rechazada', async () => {
    const p = await newProduct({ stock: 6 })
    const id = await insertSale({ status: 'pendiente', items: [{ productId: p, qty: 1 }] })
    await voidSale(db, { orgId: ORG_A, userId: ROOT, id, reason: 'Error de cobro' })
    const err = await approveSale(db, { orgId: ORG_A, userId: ROOT, id }).catch((e) => e)
    expect(err.message).toBe('La venta ya fue procesada')
  })

  it('el cajero ve sus pendientes (estado "pendiente") y no las ajenas', async () => {
    const day = '2026-05-20'
    const own = await insertSale({
      cashierId: ANA,
      status: 'pendiente',
      createdAt: at(`${day}T10:00:00`),
    })
    await insertSale({ cashierId: LUIS, status: 'pendiente', createdAt: at(`${day}T11:00:00`) })
    const { rows } = await listSales(db, scope({ ...range(day), status: 'pendiente' }, ana))
    expect(rows.map((r) => [r.id, r.status])).toEqual([[own, 'pendiente']])
    expect(await getSale(db, { orgId: ORG_A, viewer: ana, id: own })).toMatchObject({
      status: 'pendiente',
    })
  })

  it('countPendingSales cuenta solo las pendientes de la bodega', async () => {
    const before = await countPendingSales(db, ORG_A)
    const beforeB = await countPendingSales(db, ORG_B)
    await insertSale({ status: 'pendiente' })
    await insertSale({ status: 'pendiente' })
    await insertSale({}) // completada
    await insertSale({ orgId: ORG_B, status: 'pendiente' })
    expect(await countPendingSales(db, ORG_A)).toBe(before + 2)
    expect(await countPendingSales(db, ORG_B)).toBe(beforeB + 1)
  })
})

describe('exportRows', () => {
  it('trae las ventas filtradas con sus productos y respeta el alcance del cajero', async () => {
    const day = '2026-05-01'
    const cola = await newProduct({ name: 'Cola' })
    const pan = await newProduct({ name: 'Pan' })
    const mine = await insertSale({
      cashierId: ANA,
      createdAt: at(`${day}T10:00:00`),
      items: [
        { productId: cola, qty: 2, name: 'Cola' },
        { productId: pan, qty: 1, name: 'Pan' },
      ],
    })
    await insertSale({ cashierId: LUIS, createdAt: at(`${day}T11:00:00`) })
    await markVoided(mine)

    const asCajero = await exportRows(db, scope({ ...range(day), cashierId: LUIS }, ana))
    expect(asCajero.truncated).toBe(false)
    expect(asCajero.rows).toHaveLength(1)
    expect(asCajero.rows[0]).toMatchObject({
      cashierName: 'Ana Rojas',
      status: 'anulada',
      voidReason: 'Error de cobro',
      items: [
        { name: 'Cola', qty: 2 },
        { name: 'Pan', qty: 1 },
      ],
    })

    const asAdmin = await exportRows(db, scope(range(day)))
    expect(asAdmin.rows).toHaveLength(2)
  })

  it('sin ventas devuelve vacío', async () => {
    expect(await exportRows(db, scope(range('2031-01-01')))).toEqual({ rows: [], truncated: false })
  })
})

describe('listas auxiliares de los filtros', () => {
  it('productos de la bodega incluyendo inactivos, ordenados por nombre', async () => {
    const orgId = 'org-opts'
    await db
      .insert(schema.organization)
      .values({ id: orgId, name: 'Opts', slug: 'opts', createdAt: new Date() })
    await newProduct({ name: 'Zeta' }, orgId)
    await newProduct({ name: 'Alfa', active: false }, orgId)
    await newProduct({ name: 'De otra' }, ORG_B)
    const opts = await listProductOptions(db, orgId)
    expect(opts.map((o) => [o.name, o.active])).toEqual([
      ['Alfa', false],
      ['Zeta', true],
    ])
  })

  it('cajeros: miembros actuales y quienes ya vendieron, sin repetir', async () => {
    // LUIS no es miembro de ORG_A pero ya vendió en ella; ANA y ROOT sí son miembros
    const names = (await listCashiers(db, ORG_A)).map((c) => c.name)
    expect(names).toEqual(['Ana Rojas', 'Luis Paz', 'Rosa Admin'])
  })
})

describe('getSale: cliente', () => {
  it('devuelve el cliente de la venta (nombre y documento) o null si es público general', async () => {
    const id = await insertSale()
    expect((await getSale(db, { orgId: ORG_A, viewer: admin, id }))?.customer).toBeNull()

    const [c] = await db
      .insert(schema.customer)
      .values({
        organizationId: ORG_A,
        name: 'Juan Pérez',
        nameKey: 'juan perez',
        documentType: 'dni',
        documentNumber: '12345678',
      })
      .returning({ id: schema.customer.id })
    await db
      .update(schema.sale)
      .set({
        customerId: c.id,
        customerName: 'Juan Pérez',
        customerDocumentType: 'dni',
        customerDocumentNumber: '12345678',
      })
      .where(eq(schema.sale.id, id))

    // Editar el cliente después NO cambia lo que muestra la venta (snapshot)
    await db
      .update(schema.customer)
      .set({ name: 'Nombre Nuevo', nameKey: 'nombre nuevo', documentNumber: '99999999' })
      .where(eq(schema.customer.id, c.id))

    const detail = await getSale(db, { orgId: ORG_A, viewer: admin, id })
    expect(detail?.customer).toEqual({
      id: c.id,
      name: 'Juan Pérez',
      documentType: 'dni',
      documentNumber: '12345678',
    })
    // El cajero dueño de la venta también la ve con su cliente
    expect((await getSale(db, { orgId: ORG_A, viewer: ana, id }))?.customer?.name).toBe(
      'Juan Pérez',
    )
  })
})

describe('getSale: datos del negocio', () => {
  const input = (tradeName: string) => ({
    tradeName,
    legalName: null,
    ruc: null,
    address: null,
    phone: null,
    branchName: null,
    receiptFooter: null,
  })

  it('lee el snapshot de la venta y no el perfil vigente', async () => {
    const id = await insertSale()
    await db
      .update(schema.sale)
      .set({
        businessSnapshot: {
          version: 1,
          tradeName: 'Nombre Antiguo',
          legalName: 'Antiguo S.A.C.',
          ruc: '20100047218',
          address: null,
          phone: null,
          branchName: null,
          receiptFooter: 'Hasta pronto',
        },
      })
      .where(eq(schema.sale.id, id))
    await updateBusinessProfile(db, { orgId: ORG_A, input: input('Nombre Nuevo') })

    const detail = await getSale(db, { orgId: ORG_A, viewer: admin, id })
    expect(detail?.business).toMatchObject({
      tradeName: 'Nombre Antiguo',
      ruc: '20100047218',
      receiptFooter: 'Hasta pronto',
    })
  })

  it('sin snapshot cae al perfil vigente', async () => {
    const id = await insertSale()
    await updateBusinessProfile(db, { orgId: ORG_A, input: input('Perfil Vigente') })
    const detail = await getSale(db, { orgId: ORG_A, viewer: admin, id })
    expect(detail?.business.tradeName).toBe('Perfil Vigente')
    expect(detail?.business.receiptFooter).toBe('Gracias por su compra')
  })
})
