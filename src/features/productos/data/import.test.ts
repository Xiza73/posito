// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { and, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import type { RawImportRow } from '../lib/import-parse'
import type { ProductInput } from '../lib/schemas'
import { commitImport, previewImport } from './import'
import { createProduct, listCategoriesWithCounts } from './products'

const db = drizzle(new PGlite(), { schema, casing: 'snake_case' })

const ORG_A = 'org-a'
const ORG_B = 'org-b'
const USER = 'user-1'

let n = 0
const row = (over: Partial<RawImportRow> = {}): RawImportRow => ({
  line: ++n + 1,
  name: `Producto ${n}`,
  price: '3.50',
  cost: '',
  category: '',
  barcode: '',
  stock: '',
  minStock: '',
  tracksStock: '',
  ...over,
})

const base = (over: Partial<ProductInput> = {}): ProductInput => ({
  name: 'Inca Kola 500 ml',
  barcode: null,
  priceCents: 300,
  categoryName: null,
  tracksStock: true,
  initialStock: 0,
  minStock: 0,
  ...over,
})

const run = (orgId: string, rows: RawImportRow[], updateExisting = false, allowCost = true) =>
  commitImport(db, { orgId, userId: USER, rows, updateExisting, allowCost })

const byName = async (orgId: string, name: string) =>
  (
    await db
      .select()
      .from(schema.product)
      .where(and(eq(schema.product.organizationId, orgId), eq(schema.product.name, name)))
  )[0]

const movementsOf = (productId: string) =>
  db.select().from(schema.stockMovement).where(eq(schema.stockMovement.productId, productId))

const count = async (orgId: string) =>
  (await db.select().from(schema.product).where(eq(schema.product.organizationId, orgId))).length

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
  const now = new Date()
  await db.insert(schema.organization).values([
    { id: ORG_A, name: 'Bodega A', slug: 'a', createdAt: now },
    { id: ORG_B, name: 'Bodega B', slug: 'b', createdAt: now },
  ])
  await db.insert(schema.user).values({ id: USER, name: 'Ana', email: 'ana@test.pe' })
})

describe('commitImport', () => {
  it('crea productos nuevos y cada categoría una sola vez (nombre = primera aparición)', async () => {
    const summary = await run(ORG_A, [
      row({ name: 'Leche Gloria', category: 'Lácteos', stock: '10', minStock: '2' }),
      row({ name: 'Yogurt', category: 'lacteos' }),
      row({ name: 'Galleta', category: ' LÁCTEOS ' }),
    ])
    expect(summary).toEqual({ created: 3, updated: 0, skipped: 0, errors: 0 })
    const cats = (await listCategoriesWithCounts(db, ORG_A)).filter((c) =>
      c.name.toLowerCase().startsWith('l'),
    )
    expect(cats).toHaveLength(1)
    expect(cats[0]).toMatchObject({ name: 'Lácteos', productCount: 3 })
    const leche = await byName(ORG_A, 'Leche Gloria')
    expect(leche).toMatchObject({ stock: 10, minStock: 2, priceCents: 350 })
    const movs = await movementsOf(leche.id)
    expect(movs).toHaveLength(1)
    expect(movs[0]).toMatchObject({ type: 'ingreso', quantity: 10, reason: 'Importación' })
  })

  it('sin stock no crea movimiento; con controla_stock=no ignora el stock', async () => {
    await run(ORG_A, [
      row({ name: 'Sin stock' }),
      row({ name: 'Café pasado', stock: '50', minStock: '5', tracksStock: 'no' }),
    ])
    const a = await byName(ORG_A, 'Sin stock')
    const b = await byName(ORG_A, 'Café pasado')
    expect(await movementsOf(a.id)).toHaveLength(0)
    expect(await movementsOf(b.id)).toHaveLength(0)
    expect(b).toMatchObject({ stock: 0, minStock: 0, tracksStock: false })
  })

  it('los existentes se omiten por defecto (nada cambia)', async () => {
    await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: base({ name: 'Omitido', priceCents: 100, initialStock: 5 }),
    })
    const summary = await run(ORG_A, [row({ name: 'Omitido', price: '9.99', stock: '20' })])
    expect(summary).toEqual({ created: 0, updated: 0, skipped: 1, errors: 0 })
    const p = await byName(ORG_A, 'Omitido')
    expect(p).toMatchObject({ priceCents: 100, stock: 5 })
    expect(await movementsOf(p.id)).toHaveLength(1)
  })

  it('updateExisting actualiza precio y categoría y SUMA el stock (nunca lo pisa)', async () => {
    await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: base({ name: 'Actualizable', priceCents: 100, initialStock: 5, minStock: 1 }),
    })
    const summary = await run(
      ORG_A,
      [
        row({
          name: 'ACTUALIZABLE',
          price: '2,50',
          category: 'Bebidas',
          stock: '7',
          minStock: '99',
          barcode: '555',
        }),
      ],
      true,
    )
    expect(summary).toEqual({ created: 0, updated: 1, skipped: 0, errors: 0 })
    const p = await byName(ORG_A, 'Actualizable')
    expect(p).toMatchObject({ priceCents: 250, stock: 12, minStock: 1, barcode: null })
    expect(p.categoryId).not.toBeNull()
    const movs = await movementsOf(p.id)
    expect(movs.map((m) => [m.quantity, m.reason])).toEqual(
      expect.arrayContaining([
        [5, 'Stock inicial'],
        [7, 'Importación'],
      ]),
    )
  })

  it('costo: los nuevos lo guardan; vacío = sin costo', async () => {
    await run(ORG_A, [row({ name: 'Imp con costo', cost: '2,60' }), row({ name: 'Imp sin costo' })])
    expect((await byName(ORG_A, 'Imp con costo')).costCents).toBe(260)
    expect((await byName(ORG_A, 'Imp sin costo')).costCents).toBeNull()
  })

  it('costo: un existente solo cambia con "actualizar"; vacío conserva el actual', async () => {
    await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: base({ name: 'Costeado', priceCents: 400, costCents: 300 }),
    })
    // Sin actualizar: se omite, el costo no cambia
    await run(ORG_A, [row({ name: 'Costeado', price: '4', cost: '1' })])
    expect((await byName(ORG_A, 'Costeado')).costCents).toBe(300)
    // Actualizando con costo: cambia
    await run(ORG_A, [row({ name: 'Costeado', price: '4', cost: '3.10' })], true)
    expect((await byName(ORG_A, 'Costeado')).costCents).toBe(310)
    // Actualizando con costo vacío: conserva
    await run(ORG_A, [row({ name: 'Costeado', price: '4.50' })], true)
    const p = await byName(ORG_A, 'Costeado')
    expect(p).toMatchObject({ priceCents: 450, costCents: 310 })
  })

  it('allowCost=false: nunca escribe cost_cents (ni en nuevos ni al actualizar)', async () => {
    await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: base({ name: 'Costo protegido', priceCents: 400, costCents: 300 }),
    })
    await run(
      ORG_A,
      [
        row({ name: 'Costo protegido', price: '4', cost: '1' }),
        row({ name: 'Nuevo sin permiso', cost: '2' }),
      ],
      true,
      false,
    )
    expect((await byName(ORG_A, 'Costo protegido')).costCents).toBe(300)
    expect((await byName(ORG_A, 'Nuevo sin permiso')).costCents).toBeNull()
  })

  it('costo inválido = fila con error y no se escribe nada', async () => {
    const summary = await run(ORG_A, [row({ name: 'Costo malo', cost: '-3' })])
    expect(summary).toMatchObject({ created: 0, errors: 1 })
    expect(await byName(ORG_A, 'Costo malo')).toBeUndefined()
  })

  it('updateExisting con categoría vacía conserva la categoría actual', async () => {
    await run(ORG_A, [row({ name: 'Con categoría', category: 'Hogar' })])
    const before = await byName(ORG_A, 'Con categoría')
    await run(ORG_A, [row({ name: 'Con categoría', price: '8' })], true)
    const after = await byName(ORG_A, 'Con categoría')
    expect(after.categoryId).toBe(before.categoryId)
    expect(after.priceCents).toBe(800)
  })

  it('updateExisting no suma stock a un producto que no controla stock', async () => {
    await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: base({ name: 'Preparado', tracksStock: false }),
    })
    await run(ORG_A, [row({ name: 'Preparado', stock: '10' })], true)
    const p = await byName(ORG_A, 'Preparado')
    expect(p.stock).toBe(0)
    expect(await movementsOf(p.id)).toHaveLength(0)
  })

  it('duplicados dentro del archivo: solo se aplica el primero', async () => {
    const summary = await run(ORG_A, [
      row({ name: 'Repetido', price: '1' }),
      row({ name: 'repetido', price: '2' }),
      row({ name: 'Otro nombre', barcode: 'DUP1' }),
      row({ name: 'Y otro', barcode: 'DUP1' }),
    ])
    expect(summary).toEqual({ created: 2, updated: 0, skipped: 2, errors: 0 })
    expect((await byName(ORG_A, 'Repetido')).priceCents).toBe(100)
    expect(await byName(ORG_A, 'Y otro')).toBeUndefined()
  })

  it('un nombre que normaliza igual a uno existente cuenta como existente', async () => {
    await createProduct(db, { orgId: ORG_A, userId: USER, input: base({ name: 'Chicha morada' }) })
    const before = await count(ORG_A)
    const summary = await run(ORG_A, [row({ name: '  CHICHA   Morada ' })])
    expect(summary.skipped).toBe(1)
    expect(await count(ORG_A)).toBe(before)
  })

  it('código de barras de otro producto: fila con error, no se aplica', async () => {
    await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: base({ name: 'Dueño del código', barcode: '9990001' }),
    })
    const summary = await run(ORG_A, [
      row({ name: 'Intruso', barcode: '9990001' }),
      row({ name: 'Bueno' }),
    ])
    expect(summary).toEqual({ created: 1, updated: 0, skipped: 0, errors: 1 })
    expect(await byName(ORG_A, 'Intruso')).toBeUndefined()
    expect(await byName(ORG_A, 'Bueno')).toBeDefined()
  })

  it('los productos de otra bodega no cuentan como existentes', async () => {
    await createProduct(db, {
      orgId: ORG_B,
      userId: USER,
      input: base({ name: 'Solo en B', barcode: '4440001' }),
    })
    const summary = await run(ORG_A, [row({ name: 'Solo en B', barcode: '4440001' })])
    expect(summary.created).toBe(1)
    expect(await byName(ORG_A, 'Solo en B')).toBeDefined()
    expect((await byName(ORG_B, 'Solo en B')).priceCents).toBe(300)
  })

  it('las filas con error no se importan y el resto sí', async () => {
    const summary = await run(ORG_A, [
      row({ name: 'Precio malo', price: 'abc' }),
      row({ name: 'Precio bueno' }),
    ])
    expect(summary).toEqual({ created: 1, updated: 0, skipped: 0, errors: 1 })
    expect(await byName(ORG_A, 'Precio malo')).toBeUndefined()
  })

  it('es atómico: si falla el último paso (movimientos), no queda ni producto ni categoría', async () => {
    // El usuario no existe -> la FK de stock_movement falla DESPUÉS de insertar categorías y productos
    const err = await commitImport(db, {
      orgId: ORG_A,
      userId: 'usuario-fantasma',
      rows: [row({ name: 'Atómico 1', category: 'Fantasma', stock: '3' })],
      updateExisting: false,
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(await byName(ORG_A, 'Atómico 1')).toBeUndefined()
    const cats = await listCategoriesWithCounts(db, ORG_A)
    expect(cats.some((c) => c.name === 'Fantasma')).toBe(false)
  })

  it('importa más de un lote (600 filas)', async () => {
    const rows = Array.from({ length: 600 }, (_, i) =>
      row({ name: `Masivo ${i}`, stock: '1', category: `Cat ${i % 3}` }),
    )
    const summary = await run(ORG_B, rows)
    expect(summary.created).toBe(600)
    const cats = await listCategoriesWithCounts(db, ORG_B)
    expect(cats.filter((c) => c.name.startsWith('Cat '))).toHaveLength(3)
    const movs = await db
      .select()
      .from(schema.stockMovement)
      .where(eq(schema.stockMovement.organizationId, ORG_B))
    expect(movs.filter((m) => m.reason === 'Importación')).toHaveLength(600)
  })

  it('actualiza en lote (600 existentes) con precio y stock sumado', async () => {
    const names = Array.from({ length: 600 }, (_, i) => `Masivo ${i}`)
    const summary = await run(
      ORG_B,
      names.map((name) => row({ name, price: '1.25', stock: '2' })),
      true,
    )
    expect(summary).toEqual({ created: 0, updated: 600, skipped: 0, errors: 0 })
    const p = await byName(ORG_B, 'Masivo 599')
    expect(p).toMatchObject({ priceCents: 125, stock: 3 })
  })
})

describe('importación y precios por mayor', () => {
  const tiered = async (name: string) => {
    const { id } = await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: base({ name, priceCents: 350, tiers: [{ minQty: 6, unitPriceCents: 300 }] }),
    })
    return id
  }
  const tiersOf = async (id: string) =>
    db.select().from(schema.productPriceTier).where(eq(schema.productPriceTier.productId, id))

  it('commit con "Actualizar": cambiar el precio de un producto con niveles es error y no escribe', async () => {
    const id = await tiered('Con niveles A')
    const summary = await run(
      ORG_A,
      [row({ name: 'Con niveles A', price: '5.00', stock: '4' })],
      true,
    )
    expect(summary).toEqual({ created: 0, updated: 0, skipped: 0, errors: 1 })
    expect(await byName(ORG_A, 'Con niveles A')).toMatchObject({ priceCents: 350, stock: 0 })
    expect(await movementsOf(id)).toHaveLength(0)
    expect(await tiersOf(id)).toHaveLength(1)
  })

  it('commit con el mismo precio sí actualiza (suma stock) y conserva los niveles', async () => {
    const id = await tiered('Con niveles B')
    const summary = await run(
      ORG_A,
      [row({ name: 'Con niveles B', price: '3.50', stock: '4' })],
      true,
    )
    expect(summary).toEqual({ created: 0, updated: 1, skipped: 0, errors: 0 })
    expect(await byName(ORG_A, 'Con niveles B')).toMatchObject({ priceCents: 350, stock: 4 })
    expect(await tiersOf(id)).toHaveLength(1)
  })

  it('sin "Actualizar" el existente se omite y nada cambia', async () => {
    await tiered('Con niveles C')
    const summary = await run(ORG_A, [row({ name: 'Con niveles C', price: '9.00' })], false)
    expect(summary).toEqual({ created: 0, updated: 0, skipped: 1, errors: 0 })
    expect(await byName(ORG_A, 'Con niveles C')).toMatchObject({ priceCents: 350 })
  })

  it('la vista previa marca el error con el mensaje', async () => {
    await tiered('Con niveles D')
    const preview = await previewImport(db, {
      orgId: ORG_A,
      rows: [row({ name: 'Con niveles D', price: '8.00' })],
    })
    expect(preview.counts.error).toBe(1)
    expect(preview.rows[0].errors[0].message).toBe(
      'Tiene precios por mayor: cambia su precio desde el producto',
    )
  })

  it('actualizar varios productos a la vez (con bloqueo ordenado por id) funciona', async () => {
    const names = ['Lote 1', 'Lote 2', 'Lote 3']
    for (const name of names) {
      await createProduct(db, {
        orgId: ORG_A,
        userId: USER,
        input: base({ name, priceCents: 100 }),
      })
    }
    const summary = await run(
      ORG_A,
      names.map((name) => row({ name, price: '2.00' })),
      true,
    )
    expect(summary.updated).toBe(3)
    for (const name of names) expect((await byName(ORG_A, name)).priceCents).toBe(200)
  })
})

describe('previewImport', () => {
  it('clasifica sin escribir nada', async () => {
    await createProduct(db, { orgId: ORG_A, userId: USER, input: base({ name: 'Previa' }) })
    const before = await count(ORG_A)
    const preview = await previewImport(db, {
      orgId: ORG_A,
      rows: [
        row({ name: 'Previa' }),
        row({ name: 'Nueva previa' }),
        row({ name: 'Nueva previa' }),
        row({ name: 'Mala', price: '' }),
      ],
    })
    expect(preview.counts).toEqual({ new: 1, existing: 1, duplicate: 1, error: 1 })
    expect(await count(ORG_A)).toBe(before)
  })
})
