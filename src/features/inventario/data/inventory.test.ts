// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { PAGE_SIZE } from '../lib/filters'
import type { MovementType } from '../lib/labels'
import {
  adjustStock,
  countStock,
  exportStockRows,
  getStockItem,
  InactiveProductError,
  InsufficientStockError,
  InventoryError,
  listMovements,
  listMovementUsers,
  listStock,
  ProductNotFoundError,
  productMovements,
  registerIngreso,
  stockSummary,
  UntrackedProductError,
} from './inventory'

// Migraciones reales sobre Postgres en memoria (PGlite). Una sola conexión: la concurrencia real
// (FOR UPDATE) no se puede probar aquí; las garantías son el bloqueo y el CHECK de la DB.
const db = drizzle(new PGlite(), { schema, casing: 'snake_case' })

const ORG_A = 'org-a'
const ORG_B = 'org-b'
const ANA = 'user-ana'
const LUIS = 'user-luis'

let seq = 0

async function newProduct(
  over: Partial<typeof schema.product.$inferInsert> = {},
  orgId = ORG_A,
): Promise<string> {
  seq++
  const [p] = await db
    .insert(schema.product)
    .values({
      organizationId: orgId,
      name: `Producto ${seq}`,
      nameKey: `producto-${seq}-${crypto.randomUUID()}`,
      priceCents: 300,
      stock: 10,
      ...over,
    })
    .returning({ id: schema.product.id })
  return p.id
}

const stockOf = async (id: string) =>
  (await db.select().from(schema.product).where(eq(schema.product.id, id)))[0].stock

const movementsOf = (productId: string) =>
  db.select().from(schema.stockMovement).where(eq(schema.stockMovement.productId, productId))

/** Movimiento insertado a mano (ventas/anulaciones vienen de otras features; aquí solo se leen). */
async function insertMovement(
  productId: string,
  type: MovementType,
  quantity: number,
  over: Partial<typeof schema.stockMovement.$inferInsert> = {},
) {
  await db.insert(schema.stockMovement).values({
    organizationId: ORG_A,
    productId,
    type,
    quantity,
    userId: ANA,
    ...over,
  })
}

async function insertSale(number: number) {
  const [s] = await db
    .insert(schema.sale)
    .values({
      organizationId: ORG_A,
      series: 'B001',
      number,
      cashierId: LUIS,
      paymentMethod: 'efectivo',
      subtotalCents: 254,
      igvCents: 46,
      totalCents: 300,
    })
    .returning({ id: schema.sale.id })
  return s.id
}

const noFilters = { query: '', includeInactive: false }

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
  const now = new Date()
  await db.insert(schema.organization).values([
    { id: ORG_A, name: 'Bodega A', slug: 'a', createdAt: now },
    { id: ORG_B, name: 'Bodega B', slug: 'b', createdAt: now },
  ])
  await db.insert(schema.user).values([
    { id: ANA, name: 'Ana', email: 'ana@test.pe' },
    { id: LUIS, name: 'Luis', email: 'luis@test.pe' },
  ])
})

describe('registerIngreso', () => {
  it('un producto: movimiento `ingreso` positivo, nota como motivo y stock actualizado', async () => {
    const id = await newProduct({ stock: 4 })
    const res = await registerIngreso(db, {
      orgId: ORG_A,
      userId: ANA,
      lines: [{ productId: id, quantity: 6 }],
      note: 'Proveedor Backus, factura 123',
    })
    expect(res.units).toBe(6)
    expect(res.lines[0]).toMatchObject({ productId: id, quantity: 6, stock: 10 })
    expect(await stockOf(id)).toBe(10)
    expect(await movementsOf(id)).toMatchObject([
      {
        type: 'ingreso',
        quantity: 6,
        userId: ANA,
        organizationId: ORG_A,
        reason: 'Proveedor Backus, factura 123',
        saleId: null,
      },
    ])
  })

  it('sin nota guarda reason null', async () => {
    const id = await newProduct()
    await registerIngreso(db, {
      orgId: ORG_A,
      userId: ANA,
      lines: [{ productId: id, quantity: 1 }],
      note: null,
    })
    expect((await movementsOf(id))[0].reason).toBeNull()
  })

  it('lote: un movimiento por producto, con la misma nota, en una sola operación', async () => {
    const a = await newProduct({ stock: 0 })
    const b = await newProduct({ stock: 5 })
    const res = await registerIngreso(db, {
      orgId: ORG_A,
      userId: ANA,
      lines: [
        { productId: a, quantity: 10 },
        { productId: b, quantity: 3 },
      ],
      note: 'Pedido lunes',
    })
    expect(res.units).toBe(13)
    expect(await stockOf(a)).toBe(10)
    expect(await stockOf(b)).toBe(8)
    expect((await movementsOf(a))[0]).toMatchObject({ quantity: 10, reason: 'Pedido lunes' })
    expect((await movementsOf(b))[0]).toMatchObject({ quantity: 3, reason: 'Pedido lunes' })
  })

  it('lote: las líneas repetidas del mismo producto se unen en UN movimiento', async () => {
    const a = await newProduct({ stock: 1 })
    const res = await registerIngreso(db, {
      orgId: ORG_A,
      userId: ANA,
      lines: [
        { productId: a, quantity: 2 },
        { productId: a, quantity: 5 },
      ],
      note: null,
    })
    expect(res.lines).toHaveLength(1)
    const movs = await movementsOf(a)
    expect(movs).toHaveLength(1)
    expect(movs[0].quantity).toBe(7)
    expect(await stockOf(a)).toBe(8)
  })

  it('lote: todo o nada — si una línea es inválida no se escribe ninguna', async () => {
    const ok = await newProduct({ stock: 3 })
    const inactive = await newProduct({ active: false })
    await expect(
      registerIngreso(db, {
        orgId: ORG_A,
        userId: ANA,
        lines: [
          { productId: ok, quantity: 5 },
          { productId: inactive, quantity: 5 },
        ],
        note: null,
      }),
    ).rejects.toBeInstanceOf(InactiveProductError)
    expect(await stockOf(ok)).toBe(3)
    expect(await movementsOf(ok)).toHaveLength(0)
  })

  it('rechaza cantidades no positivas o no enteras y más de 200 líneas', async () => {
    const id = await newProduct()
    for (const quantity of [0, -3, 1.5]) {
      await expect(
        registerIngreso(db, {
          orgId: ORG_A,
          userId: ANA,
          lines: [{ productId: id, quantity }],
          note: null,
        }),
      ).rejects.toBeInstanceOf(InventoryError)
    }
    await expect(
      registerIngreso(db, {
        orgId: ORG_A,
        userId: ANA,
        lines: Array.from({ length: 201 }, () => ({ productId: id, quantity: 1 })),
        note: null,
      }),
    ).rejects.toBeInstanceOf(InventoryError)
    await expect(
      registerIngreso(db, { orgId: ORG_A, userId: ANA, lines: [], note: null }),
    ).rejects.toBeInstanceOf(InventoryError)
    expect(await stockOf(id)).toBe(10)
  })

  it('rechaza producto de otra bodega o inexistente', async () => {
    const other = await newProduct({}, ORG_B)
    await expect(
      registerIngreso(db, {
        orgId: ORG_A,
        userId: ANA,
        lines: [{ productId: other, quantity: 1 }],
        note: null,
      }),
    ).rejects.toBeInstanceOf(ProductNotFoundError)
    await expect(
      registerIngreso(db, {
        orgId: ORG_A,
        userId: ANA,
        lines: [{ productId: crypto.randomUUID(), quantity: 1 }],
        note: null,
      }),
    ).rejects.toBeInstanceOf(ProductNotFoundError)
    expect(await stockOf(other)).toBe(10)
  })

  it('rechaza productos que no controlan stock', async () => {
    const id = await newProduct({ tracksStock: false, stock: 0 })
    await expect(
      registerIngreso(db, {
        orgId: ORG_A,
        userId: ANA,
        lines: [{ productId: id, quantity: 1 }],
        note: null,
      }),
    ).rejects.toBeInstanceOf(UntrackedProductError)
    expect(await movementsOf(id)).toHaveLength(0)
  })

  it('no deja desbordar el stock (integer)', async () => {
    const id = await newProduct({ stock: 2_147_483_000 })
    await expect(
      registerIngreso(db, {
        orgId: ORG_A,
        userId: ANA,
        lines: [{ productId: id, quantity: 1_000 }],
        note: null,
      }),
    ).rejects.toBeInstanceOf(InventoryError)
    expect(await stockOf(id)).toBe(2_147_483_000)
  })
})

describe('adjustStock', () => {
  const adjust = (productId: string, delta: number, reason = 'Merma', orgId = ORG_A) =>
    adjustStock(db, { orgId, userId: ANA, productId, delta, reason })

  it('restar: movimiento `ajuste` negativo con el motivo y stock actualizado', async () => {
    const id = await newProduct({ stock: 10 })
    expect(await adjust(id, -3, 'Vencido')).toMatchObject({ previous: 10, stock: 7 })
    expect(await stockOf(id)).toBe(7)
    expect(await movementsOf(id)).toMatchObject([
      { type: 'ajuste', quantity: -3, reason: 'Vencido', userId: ANA },
    ])
  })

  it('sumar: movimiento `ajuste` positivo', async () => {
    const id = await newProduct({ stock: 2 })
    await adjust(id, 5, 'Error de registro')
    expect(await stockOf(id)).toBe(7)
    expect((await movementsOf(id))[0]).toMatchObject({ type: 'ajuste', quantity: 5 })
  })

  it('guarda el motivo "Otro: …" tal cual lo compone la acción', async () => {
    const id = await newProduct()
    await adjust(id, -1, 'Otro: se cayó la caja')
    expect((await movementsOf(id))[0].reason).toBe('Otro: se cayó la caja')
  })

  it('puede dejar el stock exactamente en 0', async () => {
    const id = await newProduct({ stock: 4 })
    await adjust(id, -4, 'Robo o pérdida')
    expect(await stockOf(id)).toBe(0)
  })

  it('resultado negativo: error amigable con el stock disponible y no escribe nada', async () => {
    const id = await newProduct({ stock: 3 })
    const err = await adjust(id, -5).catch((e) => e)
    expect(err).toBeInstanceOf(InsufficientStockError)
    expect(err.message).toContain('solo hay 3')
    expect(await stockOf(id)).toBe(3)
    expect(await movementsOf(id)).toHaveLength(0)
  })

  it('rechaza delta 0, no entero o motivo vacío', async () => {
    const id = await newProduct()
    await expect(adjust(id, 0)).rejects.toBeInstanceOf(InventoryError)
    await expect(adjust(id, 1.5)).rejects.toBeInstanceOf(InventoryError)
    await expect(adjust(id, 1, '   ')).rejects.toBeInstanceOf(InventoryError)
    expect(await movementsOf(id)).toHaveLength(0)
  })

  it('rechaza producto inactivo, sin control de stock y de otra bodega', async () => {
    const inactive = await newProduct({ active: false })
    const untracked = await newProduct({ tracksStock: false, stock: 0 })
    const other = await newProduct({}, ORG_B)
    await expect(adjust(inactive, 1)).rejects.toBeInstanceOf(InactiveProductError)
    await expect(adjust(untracked, 1)).rejects.toBeInstanceOf(UntrackedProductError)
    await expect(adjust(other, 1)).rejects.toBeInstanceOf(ProductNotFoundError)
    for (const id of [inactive, untracked, other]) expect(await movementsOf(id)).toHaveLength(0)
  })
})

describe('countStock', () => {
  const count = (productId: string, counted: number, note: string | null = null, orgId = ORG_A) =>
    countStock(db, { orgId, userId: ANA, productId, counted, note })

  it('contó más: ajuste positivo con motivo "Conteo físico"', async () => {
    const id = await newProduct({ stock: 7 })
    expect(await count(id, 9)).toMatchObject({ changed: true, previous: 7, stock: 9, delta: 2 })
    expect(await stockOf(id)).toBe(9)
    expect(await movementsOf(id)).toMatchObject([
      { type: 'ajuste', quantity: 2, reason: 'Conteo físico' },
    ])
  })

  it('contó menos: ajuste negativo y la nota se agrega al motivo', async () => {
    const id = await newProduct({ stock: 10 })
    await count(id, 4, 'Estante 2')
    expect(await stockOf(id)).toBe(4)
    expect((await movementsOf(id))[0]).toMatchObject({
      quantity: -6,
      reason: 'Conteo físico: Estante 2',
    })
  })

  it('cliente desactualizado: la diferencia sale del stock bloqueado (cliente veía 10, hay 7, contó 9)', async () => {
    const id = await newProduct({ stock: 10 })
    // Mientras el cliente contaba, otra operación bajó el stock a 7
    await adjustStock(db, { orgId: ORG_A, userId: ANA, productId: id, delta: -3, reason: 'Merma' })
    const res = await count(id, 9) // el cliente nunca manda su "stock visto"
    expect(res).toMatchObject({ previous: 7, stock: 9, delta: 2 })
    const movs = await movementsOf(id)
    expect(movs.find((m) => m.reason === 'Conteo físico')?.quantity).toBe(2)
    expect(await stockOf(id)).toBe(9)
  })

  it('conteo igual al stock: no registra nada y lo informa', async () => {
    const id = await newProduct({ stock: 5 })
    const res = await count(id, 5)
    expect(res).toMatchObject({ changed: false, delta: 0, stock: 5 })
    expect(await movementsOf(id)).toHaveLength(0)
    expect(await stockOf(id)).toBe(5)
  })

  it('permite contar 0', async () => {
    const id = await newProduct({ stock: 3 })
    await count(id, 0)
    expect(await stockOf(id)).toBe(0)
    expect((await movementsOf(id))[0].quantity).toBe(-3)
  })

  it('rechaza cantidades inválidas, inactivo, sin control y otra bodega', async () => {
    const id = await newProduct({ stock: 3 })
    await expect(count(id, -1)).rejects.toBeInstanceOf(InventoryError)
    await expect(count(id, 1.5)).rejects.toBeInstanceOf(InventoryError)
    const inactive = await newProduct({ active: false })
    const untracked = await newProduct({ tracksStock: false, stock: 0 })
    const other = await newProduct({}, ORG_B)
    await expect(count(inactive, 1)).rejects.toBeInstanceOf(InactiveProductError)
    await expect(count(untracked, 1)).rejects.toBeInstanceOf(UntrackedProductError)
    await expect(count(other, 1)).rejects.toBeInstanceOf(ProductNotFoundError)
    for (const p of [id, inactive, untracked, other]) expect(await movementsOf(p)).toHaveLength(0)
  })
})

describe('listStock / stockSummary / exportStockRows', () => {
  // Bodega aparte para clasificar sin interferencia de los demás tests
  const ORG_C = 'org-c'
  let cat: string

  beforeAll(async () => {
    await db
      .insert(schema.organization)
      .values({ id: ORG_C, name: 'Bodega C', slug: 'c', createdAt: new Date() })
    const [c] = await db
      .insert(schema.category)
      .values({ organizationId: ORG_C, name: 'Bebidas', nameKey: 'bebidas' })
      .returning({ id: schema.category.id })
    cat = c.id
    const p = (name: string, over: Partial<typeof schema.product.$inferInsert>) =>
      db.insert(schema.product).values({
        organizationId: ORG_C,
        name,
        nameKey: name.toLowerCase(),
        priceCents: 100,
        ...over,
      })
    await p('Agua', { stock: 20, minStock: 5, categoryId: cat, barcode: '775001' })
    await p('Borde', { stock: 5, minStock: 5 }) // stock <= mínimo: bajo
    await p('Cola', { stock: 2, minStock: 5 }) // bajo
    await p('Dulce', { stock: 0, minStock: 5 }) // agotado
    await p('Café', { tracksStock: false, stock: 0, minStock: 0 }) // no controla
    await p('Viejo', { active: false, stock: 0, minStock: 3 }) // inactivo agotado
    await p('Sin mínimo', { stock: 1, minStock: 0 }) // ok (mínimo 0)
    await p('Tilde 100%', { stock: 9, minStock: 1 })
  })

  const names = async (f: Partial<Parameters<typeof listStock>[1]['filters']> = {}) =>
    (await listStock(db, { orgId: ORG_C, filters: { ...noFilters, ...f } })).map((r) => r.name)

  it('por defecto oculta inactivos y ordena por nombre; incluirlos es opcional', async () => {
    expect(await names()).toEqual([
      'Agua',
      'Borde',
      'Café',
      'Cola',
      'Dulce',
      'Sin mínimo',
      'Tilde 100%',
    ])
    expect(await names({ includeInactive: true })).toContain('Viejo')
  })

  it('clasifica: stock bajo = 0 < stock <= mínimo (solo los que controlan stock)', async () => {
    expect(await names({ status: 'bajo' })).toEqual(['Borde', 'Cola'])
  })

  it('clasifica: agotado = stock 0 de productos que controlan stock', async () => {
    expect(await names({ status: 'agotado' })).toEqual(['Dulce'])
    expect(await names({ status: 'agotado', includeInactive: true })).toEqual(['Dulce', 'Viejo'])
  })

  it('el estado de cada fila coincide con stockStatus (misma regla en SQL y en TS)', async () => {
    const { stockStatus } = await import('@/lib/stock-status')
    const rows = await listStock(db, {
      orgId: ORG_C,
      filters: { ...noFilters, includeInactive: true },
    })
    const bajo = new Set(await names({ status: 'bajo', includeInactive: true }))
    const agotado = new Set(await names({ status: 'agotado', includeInactive: true }))
    for (const r of rows) {
      const s = stockStatus(r)
      expect(bajo.has(r.name)).toBe(s === 'low')
      expect(agotado.has(r.name)).toBe(s === 'out')
    }
  })

  it('busca por nombre o código (sin distinguir mayúsculas) y por categoría; los comodines son literales', async () => {
    expect(await names({ query: 'AGU' })).toEqual(['Agua'])
    expect(await names({ query: '7750' })).toEqual(['Agua'])
    expect(await names({ categoryId: cat })).toEqual(['Agua'])
    expect(await names({ query: '100%' })).toEqual(['Tilde 100%'])
    expect(await names({ query: '%' })).toEqual(['Tilde 100%'])
  })

  it('stockSummary cuenta solo activos que controlan stock, sin depender de filtros', async () => {
    // Agua, Borde, Cola, Dulce, Sin mínimo, Tilde = 6 (Café no controla, Viejo inactivo)
    expect(await stockSummary(db, ORG_C)).toEqual({ tracked: 6, low: 2, out: 1 })
  })

  it('exportStockRows usa los mismos filtros que la lista', async () => {
    const rows = await exportStockRows(db, {
      orgId: ORG_C,
      filters: { ...noFilters, status: 'bajo' },
    })
    expect(rows.map((r) => r.name)).toEqual(['Borde', 'Cola'])
    expect(rows[0]).toMatchObject({ stock: 5, minStock: 5, tracksStock: true, active: true })
  })

  it('no mezcla bodegas', async () => {
    expect(await stockSummary(db, 'org-vacia')).toEqual({ tracked: 0, low: 0, out: 0 })
    const rows = await listStock(db, { orgId: ORG_B, filters: noFilters })
    expect(rows.every((r) => r.name !== 'Agua')).toBe(true)
  })

  it('getStockItem devuelve el producto de la bodega y null si es de otra', async () => {
    const [agua] = await listStock(db, { orgId: ORG_C, filters: { ...noFilters, query: 'Agua' } })
    expect(await getStockItem(db, { orgId: ORG_C, productId: agua.id })).toMatchObject({
      name: 'Agua',
      categoryName: 'Bebidas',
    })
    expect(await getStockItem(db, { orgId: ORG_A, productId: agua.id })).toBeNull()
  })
})

describe('listMovements / productMovements', () => {
  const ORG_M = 'org-m'
  let p1: string
  let p2: string
  let saleId: string

  const at = (iso: string) => new Date(iso)
  const lima = (from: string, to: string) => ({ from, to })

  beforeAll(async () => {
    await db
      .insert(schema.organization)
      .values({ id: ORG_M, name: 'Bodega M', slug: 'm', createdAt: new Date() })
    const mk = async (name: string) =>
      (
        await db
          .insert(schema.product)
          .values({ organizationId: ORG_M, name, nameKey: name, priceCents: 100, stock: 50 })
          .returning({ id: schema.product.id })
      )[0].id
    p1 = await mk('Uno')
    p2 = await mk('Dos')
    const [s] = await db
      .insert(schema.sale)
      .values({
        organizationId: ORG_M,
        series: 'B001',
        number: 38,
        cashierId: LUIS,
        paymentMethod: 'efectivo',
        subtotalCents: 254,
        igvCents: 46,
        totalCents: 300,
      })
      .returning({ id: schema.sale.id })
    saleId = s.id

    const mov = (
      productId: string,
      type: MovementType,
      quantity: number,
      createdAt: Date,
      over: Partial<typeof schema.stockMovement.$inferInsert> = {},
    ) =>
      db.insert(schema.stockMovement).values({
        organizationId: ORG_M,
        productId,
        type,
        quantity,
        userId: ANA,
        createdAt,
        ...over,
      })

    // Límites del día de Lima: 2026-10-14 05:00Z = 00:00 Lima del 14
    await mov(p1, 'ingreso', 10, at('2026-10-14T04:59:59.000Z'), { reason: 'Antes (día 13 Lima)' })
    await mov(p1, 'ingreso', 5, at('2026-10-14T05:00:00.000Z'), {
      reason: 'Primer instante del 14',
    })
    await mov(p2, 'ajuste', -2, at('2026-10-15T12:00:00.000Z'), { reason: 'Merma', userId: LUIS })
    await mov(p1, 'venta', -1, at('2026-10-15T13:00:00.000Z'), { saleId, userId: LUIS })
    await mov(p1, 'anulacion', 1, at('2026-10-16T04:59:59.000Z'), { saleId, reason: 'Error' })
    await mov(p2, 'ingreso', 7, at('2026-10-16T05:00:00.000Z'), {
      reason: 'Primer instante del 16',
    })
  })

  const list = (filters: Partial<Parameters<typeof listMovements>[1]['filters']>, page = 1) =>
    listMovements(db, {
      orgId: ORG_M,
      filters: { ...lima('2026-10-14', '2026-10-15'), ...filters },
      page,
    })

  it('rango de Lima [00:00 del desde, 00:00 del día después del hasta)', async () => {
    const { rows } = await list({})
    const reasons = rows.map((r) => r.reason)
    expect(reasons).not.toContain('Antes (día 13 Lima)')
    expect(reasons).not.toContain('Primer instante del 16')
    expect(reasons).toContain('Primer instante del 14')
    // 14 y 15 en Lima: ingreso(5), ajuste, venta, anulación (04:59:59Z del 16 = 23:59:59 del 15)
    expect(rows).toHaveLength(4)
  })

  it('el más reciente primero', async () => {
    const { rows } = await list({})
    const times = rows.map((r) => r.createdAt)
    expect(times).toEqual([...times].sort().reverse())
  })

  it('filtra por tipo, producto y usuario', async () => {
    expect((await list({ type: 'ajuste' })).rows.map((r) => r.type)).toEqual(['ajuste'])
    expect((await list({ productId: p2 })).rows).toHaveLength(1)
    const byLuis = await list({ userId: LUIS })
    expect(byLuis.rows.map((r) => r.type).sort()).toEqual(['ajuste', 'venta'])
  })

  it('devuelve producto, usuario y, para venta/anulación, la boleta enlazable', async () => {
    const { rows } = await list({ type: 'venta' })
    expect(rows[0]).toMatchObject({
      productName: 'Uno',
      userName: 'Luis',
      quantity: -1,
      saleId,
      saleSeries: 'B001',
      saleNumber: 38,
      saleCashierId: LUIS,
    })
    const ingreso = (await list({ type: 'ingreso' })).rows[0]
    expect(ingreso).toMatchObject({ saleId: null, saleSeries: null, userName: 'Ana' })
  })

  it('no mezcla bodegas', async () => {
    const other = await listMovements(db, {
      orgId: ORG_A,
      filters: lima('2026-10-14', '2026-10-15'),
    })
    expect(other.rows.every((r) => r.createdAt >= '2026-10-14')).toBe(true)
    expect(other.rows.map((r) => r.productId)).not.toContain(p1)
  })

  it('productMovements: todo el historial de UN producto, sin rango de fechas', async () => {
    const { rows } = await productMovements(db, { orgId: ORG_M, productId: p1 })
    expect(rows).toHaveLength(4) // incluye el del día 13 de Lima
    expect(rows.every((r) => r.productId === p1)).toBe(true)
    expect((await productMovements(db, { orgId: ORG_A, productId: p1 })).rows).toHaveLength(0)
  })

  it('pagina de 50 en 50 con hasNext', async () => {
    const ORG_P = 'org-p'
    await db
      .insert(schema.organization)
      .values({ id: ORG_P, name: 'Bodega P', slug: 'p', createdAt: new Date() })
    const [prod] = await db
      .insert(schema.product)
      .values({ organizationId: ORG_P, name: 'Mucho', nameKey: 'mucho', priceCents: 1 })
      .returning({ id: schema.product.id })
    const total = PAGE_SIZE + 5
    await db.insert(schema.stockMovement).values(
      Array.from({ length: total }, (_, i) => ({
        organizationId: ORG_P,
        productId: prod.id,
        type: 'ingreso' as const,
        quantity: 1,
        userId: ANA,
        createdAt: new Date(Date.UTC(2026, 9, 15, 12, 0, i)),
      })),
    )
    const filters = lima('2026-10-15', '2026-10-15')
    const p1res = await listMovements(db, { orgId: ORG_P, filters, page: 1 })
    expect(p1res.rows).toHaveLength(PAGE_SIZE)
    expect(p1res.hasNext).toBe(true)
    const p2res = await listMovements(db, { orgId: ORG_P, filters, page: 2 })
    expect(p2res.rows).toHaveLength(5)
    expect(p2res.hasNext).toBe(false)
    const ids = new Set([...p1res.rows, ...p2res.rows].map((r) => r.id))
    expect(ids.size).toBe(total)
    // página inválida = 1
    expect((await listMovements(db, { orgId: ORG_P, filters, page: 0 })).page).toBe(1)
  })

  it('listMovementUsers incluye a quienes registraron movimientos', async () => {
    const users = await listMovementUsers(db, ORG_M)
    expect(users.map((u) => u.id)).toEqual(expect.arrayContaining([ANA, LUIS]))
  })
})

describe('integridad (red de seguridad en la DB)', () => {
  it('el CHECK impide un stock negativo aunque la app falle', async () => {
    const id = await newProduct({ stock: 1 })
    await expect(
      db.update(schema.product).set({ stock: -1 }).where(eq(schema.product.id, id)),
    ).rejects.toThrow()
  })

  it('insertMovement/insertSale: helpers de fixtures usables', async () => {
    const id = await newProduct()
    const saleId = await insertSale(9001)
    await insertMovement(id, 'venta', -1, { saleId })
    expect((await movementsOf(id))[0]).toMatchObject({ type: 'venta', quantity: -1, saleId })
  })
})
