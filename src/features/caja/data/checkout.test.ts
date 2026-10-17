// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { PAYMENT_METHODS } from '@/lib/payment'
import { updateBusinessProfile } from '@/lib/settings'
import { CheckoutError, checkout, InsufficientStockError, PriceChangedError } from './checkout'

// Migraciones reales sobre Postgres en memoria (PGlite), igual que src/db/schema.test.ts.
// Nota: PGlite es una sola conexión, así que NO se puede probar concurrencia real. Las garantías
// frente a cobros simultáneos son el `FOR UPDATE` de los productos, el upsert atómico de
// `receipt_series` (bloquea la fila hasta el commit) y el índice único (org, serie, número).
const db = drizzle(new PGlite(), { schema, casing: 'snake_case' })

const ORG_A = 'org-a'
const ORG_B = 'org-b'
const USER = 'user-1'

const uuid = () => crypto.randomUUID()

async function newProduct(
  over: Partial<typeof schema.product.$inferInsert> = {},
  orgId = ORG_A,
): Promise<string> {
  const [p] = await db
    .insert(schema.product)
    .values({
      organizationId: orgId,
      name: 'Inca Kola 500 ml',
      nameKey: uuid(), // único por fila: los fixtures repiten `name`
      priceCents: 300,
      stock: 10,
      ...over,
    })
    .returning({ id: schema.product.id })
  return p.id
}

const stockOf = async (id: string) =>
  (await db.select().from(schema.product).where(eq(schema.product.id, id)))[0].stock

const count = async (
  table: typeof schema.sale | typeof schema.stockMovement | typeof schema.saleItem,
) => (await db.select().from(table)).length

const sell = (
  items: { productId: string; quantity: number }[],
  over: Partial<Parameters<typeof checkout>[1]> = {},
) =>
  checkout(db, {
    orgId: ORG_A,
    userId: USER,
    saleId: uuid(),
    paymentMethod: 'efectivo',
    requireApproval: false,
    items,
    ...over,
  })

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
  const now = new Date()
  await db.insert(schema.organization).values([
    { id: ORG_A, name: 'Bodega A', slug: 'a', createdAt: now },
    { id: ORG_B, name: 'Bodega B', slug: 'b', createdAt: now },
  ])
  await db.insert(schema.user).values({ id: USER, name: 'Ana Rojas', email: 'ana@test.pe' })
})

describe('contrato con el esquema', () => {
  it('los métodos de pago de la UI son los del enum de la DB', () => {
    expect([...PAYMENT_METHODS]).toEqual(schema.paymentMethod.enumValues)
  })
})

describe('checkout: camino feliz', () => {
  it('crea venta, líneas, movimientos y descuenta stock; el correlativo arranca en B001-1 y sube', async () => {
    const inca = await newProduct({ name: 'Inca Kola', priceCents: 300, stock: 10 })
    const pan = await newProduct({ name: 'Pan francés', priceCents: 30, stock: 50 })

    const first = await sell(
      [
        { productId: inca, quantity: 2 },
        { productId: pan, quantity: 3 },
      ],
      { paymentMethod: 'yape_plin' },
    )

    expect(first).toMatchObject({
      series: 'B001',
      number: 1,
      paymentMethod: 'yape_plin',
      totalCents: 690,
      cashierName: 'Ana Rojas',
    })
    expect(first.subtotalCents + first.igvCents).toBe(first.totalCents)
    expect(first.lines).toEqual([
      {
        name: 'Inca Kola',
        qty: 2,
        unitPriceCents: 300,
        listUnitPriceCents: 300,
        priceSource: 'normal',
        lineTotalCents: 600,
      },
      {
        name: 'Pan francés',
        qty: 3,
        unitPriceCents: 30,
        listUnitPriceCents: 30,
        priceSource: 'normal',
        lineTotalCents: 90,
      },
    ])
    expect(await stockOf(inca)).toBe(8)
    expect(await stockOf(pan)).toBe(47)

    const movements = await db
      .select()
      .from(schema.stockMovement)
      .where(eq(schema.stockMovement.saleId, first.id))
    expect(movements).toHaveLength(2)
    expect(movements.every((m) => m.type === 'venta' && m.userId === USER)).toBe(true)
    expect(movements.map((m) => m.quantity).sort((a, b) => a - b)).toEqual([-3, -2])

    const second = await sell([{ productId: inca, quantity: 1 }])
    expect(second.number).toBe(2)
  })

  it('la fila de la venta cumple los CHECK de la DB (totales y líneas)', async () => {
    const id = await newProduct({ name: 'Galleta', priceCents: 123, stock: 100 })
    const s = await sell([{ productId: id, quantity: 7 }])
    const [row] = await db.select().from(schema.sale).where(eq(schema.sale.id, s.id))
    expect(row.subtotalCents + row.igvCents).toBe(row.totalCents)
    expect(row.totalCents).toBe(861)
    expect(row.customerId).toBeNull()
    expect(row.status).toBe('completada')
  })
})

describe('checkout: validación de ventas (requireApproval)', () => {
  it('con requireApproval la venta queda pendiente, pero descuenta stock y toma correlativo', async () => {
    const id = await newProduct({ stock: 10 })
    const before = await db.select().from(schema.receiptSeries)
    const s = await sell([{ productId: id, quantity: 3 }], { requireApproval: true })

    expect(s.status).toBe('pendiente')
    expect(s.number).toBeGreaterThan(0)
    expect(await stockOf(id)).toBe(7)
    const mv = await db
      .select()
      .from(schema.stockMovement)
      .where(eq(schema.stockMovement.saleId, s.id))
    expect(mv).toHaveLength(1)
    expect(mv[0]).toMatchObject({ type: 'venta', quantity: -3 })
    const [row] = await db.select().from(schema.sale).where(eq(schema.sale.id, s.id))
    expect(row.status).toBe('pendiente')
    expect(row.approvedAt).toBeNull()
    expect(row.approvedById).toBeNull()
    const after = await db.select().from(schema.receiptSeries)
    expect(after[0].lastNumber).toBe((before[0]?.lastNumber ?? 0) + 1)
  })

  it('sin requireApproval queda completada', async () => {
    const id = await newProduct({ stock: 5 })
    const s = await sell([{ productId: id, quantity: 1 }], { requireApproval: false })
    expect(s.status).toBe('completada')
  })

  it('reintentar una pendiente devuelve la venta con su estado ACTUAL (ya aprobada)', async () => {
    const id = await newProduct({ stock: 10 })
    const saleId = uuid()
    const a = await sell([{ productId: id, quantity: 2 }], { saleId, requireApproval: true })
    expect(a.status).toBe('pendiente')

    await db
      .update(schema.sale)
      .set({ status: 'completada', approvedAt: new Date(), approvedById: USER })
      .where(eq(schema.sale.id, saleId))

    const b = await sell([{ productId: id, quantity: 2 }], { saleId, requireApproval: true })
    expect(b.status).toBe('completada')
    expect(await stockOf(id)).toBe(8)
  })

  it('la DB exige aprobación completa: approvedAt sin approvedById se rechaza', async () => {
    const id = await newProduct({ stock: 10 })
    const s = await sell([{ productId: id, quantity: 1 }])
    await expect(
      db.update(schema.sale).set({ approvedAt: new Date() }).where(eq(schema.sale.id, s.id)),
    ).rejects.toThrow()
  })
})

describe('checkout: idempotencia', () => {
  it('reintentar con el mismo saleId devuelve la misma venta y descuenta stock una sola vez', async () => {
    const id = await newProduct({ stock: 10 })
    const saleId = uuid()
    const before = await count(schema.sale)

    const a = await sell([{ productId: id, quantity: 4 }], { saleId })
    const b = await sell([{ productId: id, quantity: 4 }], { saleId })

    expect(b).toEqual(a)
    expect(await stockOf(id)).toBe(6)
    expect(await count(schema.sale)).toBe(before + 1)
    const mv = await db
      .select()
      .from(schema.stockMovement)
      .where(eq(schema.stockMovement.saleId, saleId))
    expect(mv).toHaveLength(1)
  })

  it('otro cajero de la misma bodega no puede leer una venta ajena reusando su saleId', async () => {
    const OTHER = 'user-2'
    await db
      .insert(schema.user)
      .values({ id: OTHER, name: 'Luis', email: 'luis@test.pe' })
      .onConflictDoNothing()
    const id = await newProduct({ stock: 10 })
    const saleId = uuid()
    await sell([{ productId: id, quantity: 2 }], { saleId })
    const before = await count(schema.sale)

    const err = await sell([{ productId: id, quantity: 2 }], { saleId, userId: OTHER }).catch(
      (e) => e,
    )
    expect(err).toBeInstanceOf(CheckoutError)
    expect(await count(schema.sale)).toBe(before)
    expect(await stockOf(id)).toBe(8)
  })

  it('un saleId que existe en otra bodega da un error genérico y no escribe nada', async () => {
    const idA = await newProduct({ stock: 10 })
    const idB = await newProduct({ stock: 10 }, ORG_B)
    const saleId = uuid()
    await sell([{ productId: idA, quantity: 1 }], { saleId })
    const before = await count(schema.sale)

    const err = await sell([{ productId: idB, quantity: 1 }], { saleId, orgId: ORG_B }).catch(
      (e) => e,
    )
    expect(err).toBeInstanceOf(CheckoutError)
    expect(err.message).not.toMatch(/bodega|org/i)
    expect(await count(schema.sale)).toBe(before)
    expect(await stockOf(idB)).toBe(10)
  })
})

describe('checkout: stock', () => {
  it('stock insuficiente rechaza TODA la venta y no escribe nada', async () => {
    const ok = await newProduct({ name: 'Con stock', stock: 10 })
    const low = await newProduct({ name: 'Inca Kola 500 ml', stock: 2 })
    const [sales, movs, items] = [
      await count(schema.sale),
      await count(schema.stockMovement),
      await count(schema.saleItem),
    ]

    const err = await sell([
      { productId: ok, quantity: 1 },
      { productId: low, quantity: 3 },
    ]).catch((e) => e)

    expect(err).toBeInstanceOf(InsufficientStockError)
    expect(err.message).toBe('Solo quedan 2 de Inca Kola 500 ml')
    expect(await stockOf(ok)).toBe(10)
    expect(await stockOf(low)).toBe(2)
    expect(await count(schema.sale)).toBe(sales)
    expect(await count(schema.stockMovement)).toBe(movs)
    expect(await count(schema.saleItem)).toBe(items)
  })

  it('un rechazo no consume correlativo', async () => {
    const low = await newProduct({ stock: 1 })
    const ok = await newProduct({ stock: 5 })
    const before = await sell([{ productId: ok, quantity: 1 }])
    await sell([{ productId: low, quantity: 2 }]).catch(() => null)
    const after = await sell([{ productId: ok, quantity: 1 }])
    expect(after.number).toBe(before.number + 1)
  })

  it('tracksStock = false vende sin movimiento ni cambio de stock', async () => {
    const cafe = await newProduct({ name: 'Café pasado', tracksStock: false, stock: 0 })
    const movs = await count(schema.stockMovement)
    const s = await sell([{ productId: cafe, quantity: 5 }])
    expect(s.totalCents).toBe(1500)
    expect(await stockOf(cafe)).toBe(0)
    expect(await count(schema.stockMovement)).toBe(movs)
  })
})

describe('checkout: validación y aislamiento', () => {
  it('un producto de otra bodega se rechaza', async () => {
    const foreign = await newProduct({ name: 'Ajeno', stock: 5 }, ORG_B)
    const before = await count(schema.sale)
    const err = await sell([{ productId: foreign, quantity: 1 }]).catch((e) => e)
    expect(err).toMatchObject({ name: 'ProductUnavailableError' })
    expect(err.message).toBe('Un producto ya no está disponible')
    expect(await stockOf(foreign)).toBe(5)
    expect(await count(schema.sale)).toBe(before)
  })

  it('un producto inactivo se rechaza y se nombra', async () => {
    const id = await newProduct({ name: 'Descontinuado', active: false })
    const err = await sell([{ productId: id, quantity: 1 }]).catch((e) => e)
    expect(err).toMatchObject({ name: 'ProductUnavailableError' })
    expect(err.message).toBe('Descontinuado ya no está disponible')
  })

  it('un producto inexistente se rechaza', async () => {
    const err = await sell([{ productId: uuid(), quantity: 1 }]).catch((e) => e)
    expect(err).toMatchObject({ name: 'ProductUnavailableError' })
  })

  it('suma los productId repetidos en una sola línea', async () => {
    const id = await newProduct({ name: 'Repetido', stock: 10 })
    const s = await sell([
      { productId: id, quantity: 2 },
      { productId: id, quantity: 3 },
    ])
    expect(s.lines).toEqual([
      {
        name: 'Repetido',
        qty: 5,
        unitPriceCents: 300,
        listUnitPriceCents: 300,
        priceSource: 'normal',
        lineTotalCents: 1500,
      },
    ])
    expect(await stockOf(id)).toBe(5)
  })

  it('rechaza carrito vacío, cantidades < 1, no enteras y > 999', async () => {
    const id = await newProduct({ stock: 5000, tracksStock: false })
    for (const items of [
      [],
      [{ productId: id, quantity: 0 }],
      [{ productId: id, quantity: -1 }],
      [{ productId: id, quantity: 1.5 }],
      [{ productId: id, quantity: 1000 }],
      [
        { productId: id, quantity: 600 },
        { productId: id, quantity: 600 },
      ],
    ]) {
      await expect(sell(items)).rejects.toBeInstanceOf(CheckoutError)
    }
  })

  it('los precios los pone el servidor: lo que mande el cliente se ignora', async () => {
    const id = await newProduct({ name: 'Precio real', priceCents: 500, stock: 5 })
    const forged = [{ productId: id, quantity: 1, unitPriceCents: 1, priceCents: 1 }]
    const s = await sell(forged)
    expect(s.totalCents).toBe(500)
    expect(s.lines[0].unitPriceCents).toBe(500)
  })
})

describe('checkout: precio por mayor', () => {
  const TIERS = [
    { minQty: 6, unitPriceCents: 250 },
    { minQty: 12, unitPriceCents: 230 },
  ]

  async function withTiers(
    tiers = TIERS,
    over: Partial<typeof schema.product.$inferInsert> = {},
    orgId = ORG_A,
  ) {
    const id = await newProduct({ priceCents: 300, stock: 100, ...over }, orgId)
    await db
      .insert(schema.productPriceTier)
      .values(tiers.map((t) => ({ organizationId: orgId, productId: id, ...t })))
    return id
  }

  it('en el minQty exacto aplica el nivel a TODAS las unidades y guarda el snapshot', async () => {
    const id = await withTiers()
    const s = await sell([{ productId: id, quantity: 6 }])
    expect(s.lines[0]).toMatchObject({
      qty: 6,
      unitPriceCents: 250,
      listUnitPriceCents: 300,
      priceSource: 'mayor',
      lineTotalCents: 1500,
    })
    expect(s.totalCents).toBe(1500)
  })

  it('gana el nivel más alto alcanzado (8 u. con 6->2.50 y 12->2.30 = 8 x 2.50)', async () => {
    const id = await withTiers()
    const s8 = await sell([{ productId: id, quantity: 8 }])
    expect(s8.lines[0]).toMatchObject({ unitPriceCents: 250, lineTotalCents: 2000 })
    const s12 = await sell([{ productId: id, quantity: 12 }])
    expect(s12.lines[0]).toMatchObject({ unitPriceCents: 230, lineTotalCents: 2760 })
    expect(s12.totalCents).toBe(2760)
  })

  it('por debajo del primer nivel rige el precio normal', async () => {
    const id = await withTiers()
    const s = await sell([{ productId: id, quantity: 5 }])
    expect(s.lines[0]).toMatchObject({
      unitPriceCents: 300,
      listUnitPriceCents: 300,
      priceSource: 'normal',
      lineTotalCents: 1500,
    })
  })

  it('el cliente no puede forzar un nivel: solo manda cantidades', async () => {
    const id = await withTiers()
    const forged = [
      { productId: id, quantity: 2, unitPriceCents: 1, tier: 12, priceSource: 'mayor' },
    ]
    const s = await sell(forged)
    expect(s.lines[0]).toMatchObject({ unitPriceCents: 300, priceSource: 'normal' })
    expect(s.totalCents).toBe(600)
  })

  it('los niveles de OTRA bodega se ignoran', async () => {
    const id = await newProduct({ priceCents: 300, stock: 100 })
    // Fila inconsistente a propósito (niveles con organizationId ajeno sobre un producto de A)
    await db
      .insert(schema.productPriceTier)
      .values({ organizationId: ORG_B, productId: id, minQty: 2, unitPriceCents: 1 })
    const s = await sell([{ productId: id, quantity: 10 }])
    expect(s.lines[0]).toMatchObject({ unitPriceCents: 300, priceSource: 'normal' })
  })

  it('las líneas repetidas del mismo producto usan la cantidad SUMADA para el nivel', async () => {
    const id = await withTiers()
    const s = await sell([
      { productId: id, quantity: 4 },
      { productId: id, quantity: 4 },
    ])
    expect(s.lines).toHaveLength(1)
    expect(s.lines[0]).toMatchObject({ qty: 8, unitPriceCents: 250, lineTotalCents: 2000 })
  })

  it('mezcla productos con y sin niveles; la fila cumple los CHECK y los totales cuadran', async () => {
    const a = await withTiers(TIERS, { name: 'Con niveles' })
    const b = await newProduct({ name: 'Sin niveles', priceCents: 150, stock: 50 })
    const s = await sell([
      { productId: a, quantity: 7 },
      { productId: b, quantity: 3 },
    ])
    expect(s.totalCents).toBe(7 * 250 + 3 * 150)
    expect(s.subtotalCents + s.igvCents).toBe(s.totalCents)
    const rows = await db.select().from(schema.saleItem).where(eq(schema.saleItem.saleId, s.id))
    for (const r of rows) {
      expect(r.lineTotalCents).toBe(r.unitPriceCents * r.quantity)
      expect(
        r.priceSource === 'mayor'
          ? r.unitPriceCents < r.listUnitPriceCents
          : r.unitPriceCents === r.listUnitPriceCents,
      ).toBe(true)
    }
  })

  it('el precio normal se congela: cambiar niveles o precio después no altera la venta ni el reintento', async () => {
    const id = await withTiers()
    const saleId = uuid()
    const first = await sell([{ productId: id, quantity: 6 }], { saleId })
    await db.delete(schema.productPriceTier).where(eq(schema.productPriceTier.productId, id))
    await db.update(schema.product).set({ priceCents: 999 }).where(eq(schema.product.id, id))
    const retry = await sell([{ productId: id, quantity: 6 }], { saleId })
    expect(retry.lines).toEqual(first.lines)
    expect(retry.totalCents).toBe(1500)
    expect(retry.lines[0].priceSource).toBe('mayor')
  })

  it('un nivel que no abarata (precio >= normal) se ignora', async () => {
    const id = await withTiers([{ minQty: 2, unitPriceCents: 350 }])
    const s = await sell([{ productId: id, quantity: 3 }])
    expect(s.lines[0]).toMatchObject({ unitPriceCents: 300, priceSource: 'normal' })
  })
})

describe('checkout: guard expectedTotalCents', () => {
  it('total distinto: rechaza con PriceChangedError y no escribe NADA (ni correlativo)', async () => {
    const id = await newProduct({ priceCents: 300, stock: 10 })
    const [sales, items, moves, series] = [
      await count(schema.sale),
      await count(schema.saleItem),
      await count(schema.stockMovement),
      await db.select().from(schema.receiptSeries),
    ]
    const err = await sell([{ productId: id, quantity: 2 }], { expectedTotalCents: 500 }).catch(
      (e) => e,
    )
    expect(err).toBeInstanceOf(PriceChangedError)
    expect(err.message).toBe('Los precios cambiaron. Revisa el ticket antes de cobrar.')
    expect(await count(schema.sale)).toBe(sales)
    expect(await count(schema.saleItem)).toBe(items)
    expect(await count(schema.stockMovement)).toBe(moves)
    expect(await db.select().from(schema.receiptSeries)).toEqual(series)
    expect(await stockOf(id)).toBe(10)
  })

  it('total que coincide: cobra normalmente (con nivel por mayor incluido)', async () => {
    const id = await newProduct({ priceCents: 300, stock: 50 })
    await db
      .insert(schema.productPriceTier)
      .values({ organizationId: ORG_A, productId: id, minQty: 6, unitPriceCents: 250 })
    const s = await sell([{ productId: id, quantity: 6 }], { expectedTotalCents: 1500 })
    expect(s.totalCents).toBe(1500)
    // Con el catálogo viejo (sin nivel) el cajero vería 1800: se rechaza
    await expect(
      sell([{ productId: id, quantity: 6 }], { expectedTotalCents: 1800 }),
    ).rejects.toBeInstanceOf(PriceChangedError)
  })

  it('el reintento de una venta ya guardada ignora el guard y devuelve la venta almacenada', async () => {
    const id = await newProduct({ priceCents: 300, stock: 10 })
    const saleId = uuid()
    const first = await sell([{ productId: id, quantity: 1 }], { saleId, expectedTotalCents: 300 })
    await db.update(schema.product).set({ priceCents: 999 }).where(eq(schema.product.id, id))
    const retry = await sell([{ productId: id, quantity: 1 }], { saleId, expectedTotalCents: 999 })
    expect(retry.id).toBe(first.id)
    expect(retry.totalCents).toBe(300)
    expect(await stockOf(id)).toBe(9)
  })
})

describe('checkout: correlativo', () => {
  it('es independiente por bodega: ambas empiezan en 1', async () => {
    const a = await newProduct({ stock: 5 })
    const b = await newProduct({ stock: 5 }, 'org-b')
    // ORG_A ya vendió en tests previos; una bodega nueva empieza en 1
    const orgC = 'org-c'
    await db
      .insert(schema.organization)
      .values({ id: orgC, name: 'Bodega C', slug: 'c', createdAt: new Date() })
    const c = await newProduct({ stock: 5 }, orgC)
    const sc = await sell([{ productId: c, quantity: 1 }], { orgId: orgC })
    const sb = await sell([{ productId: b, quantity: 1 }], { orgId: ORG_B })
    const sa = await sell([{ productId: a, quantity: 1 }])
    expect(sc.number).toBe(1)
    expect(sb.number).toBe(1)
    expect(sa.number).toBeGreaterThan(1)
    const sc2 = await sell([{ productId: c, quantity: 1 }], { orgId: orgC })
    expect(sc2.number).toBe(2)
  })

  it('tras cambiar serie y número en receipt_series, el cobro continúa desde ahí', async () => {
    const orgD = 'org-d'
    await db
      .insert(schema.organization)
      .values({ id: orgD, name: 'Bodega D', slug: 'd', createdAt: new Date() })
    const d = await newProduct({ stock: 50 }, orgD)
    expect((await sell([{ productId: d, quantity: 1 }], { orgId: orgD })).number).toBe(1)

    // Lo mismo que hace updateReceiptSeries (configuracion): lastNumber = siguiente - 1
    await db
      .update(schema.receiptSeries)
      .set({ series: 'B002', lastNumber: 99 })
      .where(eq(schema.receiptSeries.organizationId, orgD))

    const s = await sell([{ productId: d, quantity: 1 }], { orgId: orgD })
    expect(s).toMatchObject({ series: 'B002', number: 100 })
    const next = await sell([{ productId: d, quantity: 1 }], { orgId: orgD })
    expect(next).toMatchObject({ series: 'B002', number: 101 })
  })

  it('si el número ya existe en la serie, falla con un mensaje hacia Configuración y no escribe', async () => {
    const orgE = 'org-e'
    await db
      .insert(schema.organization)
      .values({ id: orgE, name: 'Bodega E', slug: 'e', createdAt: new Date() })
    const e = await newProduct({ stock: 10 }, orgE)
    await sell([{ productId: e, quantity: 1 }], { orgId: orgE }) // B001-1
    await db
      .update(schema.receiptSeries)
      .set({ lastNumber: 0 }) // alguien reinició el contador a mano
      .where(eq(schema.receiptSeries.organizationId, orgE))

    const err = await sell([{ productId: e, quantity: 1 }], { orgId: orgE }).catch((x) => x)
    expect(err).toBeInstanceOf(CheckoutError)
    expect(err.message).toMatch(/Configuración/)
    expect(await stockOf(e)).toBe(9)
  })
})

describe('checkout: cliente', () => {
  async function newCustomer(
    over: Partial<typeof schema.customer.$inferInsert> = {},
    orgId = ORG_A,
  ): Promise<string> {
    const [c] = await db
      .insert(schema.customer)
      .values({
        organizationId: orgId,
        name: 'Juan Pérez',
        nameKey: 'juan perez',
        documentType: 'dni',
        documentNumber: uuid().slice(0, 8),
        ...over,
      })
      .returning({ id: schema.customer.id })
    return c.id
  }

  it('sin cliente la venta queda como público general (customer null)', async () => {
    const id = await newProduct({ stock: 5 })
    const s = await sell([{ productId: id, quantity: 1 }])
    expect(s.customer).toBeNull()
  })

  it('guarda el cliente en la venta y lo devuelve con nombre y documento (de la DB)', async () => {
    const id = await newProduct({ stock: 5 })
    const customerId = await newCustomer({ documentType: 'ruc', documentNumber: '20100047218' })
    const s = await sell([{ productId: id, quantity: 1 }], { customerId })

    expect(s.customer).toEqual({
      id: customerId,
      name: 'Juan Pérez',
      documentType: 'ruc',
      documentNumber: '20100047218',
    })
    const [row] = await db.select().from(schema.sale).where(eq(schema.sale.id, s.id))
    expect(row.customerId).toBe(customerId)
  })

  it('un cliente de otra bodega se rechaza y no escribe nada', async () => {
    const id = await newProduct({ stock: 5 })
    const foreign = await newCustomer({}, ORG_B)
    const before = await count(schema.sale)

    const err = await sell([{ productId: id, quantity: 1 }], { customerId: foreign }).catch(
      (e) => e,
    )
    expect(err).toBeInstanceOf(CheckoutError)
    expect(err.message).toBe('El cliente ya no está disponible')
    expect(await count(schema.sale)).toBe(before)
    expect(await stockOf(id)).toBe(5)
  })

  it('un cliente inactivo se rechaza', async () => {
    const id = await newProduct({ stock: 5 })
    const customerId = await newCustomer({ active: false })
    const err = await sell([{ productId: id, quantity: 1 }], { customerId }).catch((e) => e)
    expect(err).toBeInstanceOf(CheckoutError)
    expect(err.message).toBe('El cliente ya no está disponible')
    expect(await stockOf(id)).toBe(5)
  })

  it('un cliente inexistente se rechaza', async () => {
    const id = await newProduct({ stock: 5 })
    const err = await sell([{ productId: id, quantity: 1 }], { customerId: uuid() }).catch((e) => e)
    expect(err).toBeInstanceOf(CheckoutError)
  })

  it('el reintento conserva el cliente de la venta original (idempotente)', async () => {
    const id = await newProduct({ stock: 10 })
    const customerId = await newCustomer()
    const saleId = uuid()
    const a = await sell([{ productId: id, quantity: 2 }], { saleId, customerId })
    // Entre el cobro y el reintento el cliente se desactiva: el reintento devuelve lo ya guardado
    await db
      .update(schema.customer)
      .set({ active: false })
      .where(eq(schema.customer.id, customerId))
    const b = await sell([{ productId: id, quantity: 2 }], { saleId, customerId })

    expect(b).toEqual(a)
    expect(b.customer?.id).toBe(customerId)
    expect(await stockOf(id)).toBe(8)
  })

  it('snapshot: editar el cliente después NO cambia el nombre ni el documento de la venta ni del reintento', async () => {
    const id = await newProduct({ stock: 10 })
    const customerId = await newCustomer({
      name: 'Juan Pérez',
      documentType: 'dni',
      documentNumber: '12345678',
    })
    const saleId = uuid()
    const a = await sell([{ productId: id, quantity: 1 }], { saleId, customerId })

    await db
      .update(schema.customer)
      .set({
        name: 'Otro Nombre',
        nameKey: 'otro nombre',
        documentType: 'ruc',
        documentNumber: '20999999999',
      })
      .where(eq(schema.customer.id, customerId))

    const b = await sell([{ productId: id, quantity: 1 }], { saleId, customerId })
    expect(b).toEqual(a)
    expect(b.customer).toEqual({
      id: customerId,
      name: 'Juan Pérez',
      documentType: 'dni',
      documentNumber: '12345678',
    })
    const [row] = await db.select().from(schema.sale).where(eq(schema.sale.id, saleId))
    expect(row).toMatchObject({
      customerName: 'Juan Pérez',
      customerDocumentType: 'dni',
      customerDocumentNumber: '12345678',
    })
  })

  it('un cliente sin documento guarda el snapshot solo con nombre', async () => {
    const id = await newProduct({ stock: 5 })
    const customerId = await newCustomer({
      name: 'Doña Rosa',
      documentType: null,
      documentNumber: null,
    })
    const s = await sell([{ productId: id, quantity: 1 }], { customerId })
    expect(s.customer).toEqual({
      id: customerId,
      name: 'Doña Rosa',
      documentType: null,
      documentNumber: null,
    })
  })

  it('un reintento sin cliente no pisa el cliente guardado', async () => {
    const id = await newProduct({ stock: 10 })
    const customerId = await newCustomer()
    const saleId = uuid()
    await sell([{ productId: id, quantity: 1 }], { saleId, customerId })
    const again = await sell([{ productId: id, quantity: 1 }], { saleId })
    expect(again.customer?.id).toBe(customerId)
  })
})

describe('checkout: datos del negocio (snapshot)', () => {
  const profile = (over: Partial<Parameters<typeof updateBusinessProfile>[1]['input']> = {}) =>
    updateBusinessProfile(db, {
      orgId: ORG_B,
      input: {
        tradeName: 'Bodega Nueva',
        legalName: 'Nueva S.A.C.',
        ruc: '20100047218',
        address: 'Av. Lima 123',
        phone: null,
        branchName: null,
        receiptFooter: null,
        ...over,
      },
    })
  const sellB = (productId: string, over: Partial<Parameters<typeof checkout>[1]> = {}) =>
    sell([{ productId, quantity: 1 }], { orgId: ORG_B, ...over })

  it('sin perfil guardado usa el nombre de la organization y el pie por defecto', async () => {
    const id = await newProduct({}, ORG_B)
    const s = await sellB(id)
    expect(s.business).toEqual({
      version: 1,
      tradeName: 'Bodega B',
      legalName: null,
      ruc: null,
      address: null,
      phone: null,
      branchName: null,
      receiptFooter: 'Gracias por su compra',
    })
  })

  it('guarda el snapshot y cambiar el perfil después NO altera la venta ni su reintento', async () => {
    await profile()
    const id = await newProduct({}, ORG_B)
    const saleId = uuid()
    const a = await sellB(id, { saleId })
    expect(a.business).toMatchObject({ tradeName: 'Bodega Nueva', ruc: '20100047218' })

    await profile({ tradeName: 'Otro Nombre', ruc: null, legalName: null, address: null })

    const retry = await sellB(id, { saleId })
    expect(retry.business).toEqual(a.business)
    const [row] = await db.select().from(schema.sale).where(eq(schema.sale.id, saleId))
    expect(row.businessSnapshot).toMatchObject({ version: 1, tradeName: 'Bodega Nueva' })

    // Una venta nueva ya usa el perfil vigente
    const fresh = await sellB(id)
    expect(fresh.business).toMatchObject({ tradeName: 'Otro Nombre', ruc: null })
  })

  it('una venta sin snapshot (anterior a la función) cae al perfil vigente', async () => {
    await profile({ tradeName: 'Vigente SAC', legalName: null, ruc: null, address: null })
    const id = await newProduct({}, ORG_B)
    const saleId = uuid()
    await sellB(id, { saleId })
    await db.update(schema.sale).set({ businessSnapshot: null }).where(eq(schema.sale.id, saleId))
    const retry = await sellB(id, { saleId })
    expect(retry.business.tradeName).toBe('Vigente SAC')

    // jsonb de forma inválida: mismo respaldo
    await db
      .update(schema.sale)
      .set({ businessSnapshot: { version: 2, foo: 'bar' } })
      .where(eq(schema.sale.id, saleId))
    expect((await sellB(id, { saleId })).business.tradeName).toBe('Vigente SAC')
  })
})
