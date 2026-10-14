// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { uniqueViolation } from '@/lib/errors'
import type { ProductInput } from '../lib/schemas'
import {
  createCategory,
  createProduct,
  deleteCategory,
  listCategoriesWithCounts,
  listProducts,
  renameCategory,
  setProductActive,
  updateProduct,
} from './products'

// Migraciones reales sobre Postgres en memoria (PGlite), igual que src/db/schema.test.ts
const db = drizzle(new PGlite(), { schema, casing: 'snake_case' })

const ORG_A = 'org-a'
const ORG_B = 'org-b'
const USER = 'user-1'

const input = (over: Partial<ProductInput> = {}): ProductInput => ({
  name: 'Inca Kola 500 ml',
  barcode: null,
  priceCents: 300,
  categoryName: null,
  tracksStock: true,
  initialStock: 0,
  minStock: 0,
  ...over,
})

const movementsOf = (productId: string) =>
  db.select().from(schema.stockMovement).where(eq(schema.stockMovement.productId, productId))

const rowOf = async (id: string) =>
  (await db.select().from(schema.product).where(eq(schema.product.id, id)))[0]

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
  const now = new Date()
  await db.insert(schema.organization).values([
    { id: ORG_A, name: 'Bodega A', slug: 'a', createdAt: now },
    { id: ORG_B, name: 'Bodega B', slug: 'b', createdAt: now },
  ])
  await db.insert(schema.user).values({ id: USER, name: 'Ana', email: 'ana@test.pe' })
})

describe('createProduct', () => {
  it('con stock inicial crea exactamente un movimiento `ingreso` y stock = N', async () => {
    const { id } = await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: input({ name: 'Gaseosa', initialStock: 12 }),
    })
    const movements = await movementsOf(id)
    expect(movements).toHaveLength(1)
    expect(movements[0]).toMatchObject({
      type: 'ingreso',
      quantity: 12,
      userId: USER,
      reason: 'Stock inicial',
      organizationId: ORG_A,
    })
    expect((await rowOf(id)).stock).toBe(12)
  })

  it('sin stock inicial no crea movimiento', async () => {
    const { id } = await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: input({ name: 'Sin stock' }),
    })
    expect(await movementsOf(id)).toHaveLength(0)
    expect((await rowOf(id)).stock).toBe(0)
  })

  it('tracksStock=false no crea movimiento ni guarda stock', async () => {
    const { id } = await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: input({ name: 'Café pasado', tracksStock: false, initialStock: 50, minStock: 5 }),
    })
    expect(await movementsOf(id)).toHaveLength(0)
    expect(await rowOf(id)).toMatchObject({ stock: 0, minStock: 0, tracksStock: false })
  })

  it('crea la categoría nueva al vuelo y la reutiliza (sin distinguir mayúsculas)', async () => {
    const a = await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: input({ name: 'Pan', categoryName: 'Panadería' }),
    })
    const b = await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: input({ name: 'Bizcocho', categoryName: 'panadería' }),
    })
    const [pa, pb] = [await rowOf(a.id), await rowOf(b.id)]
    expect(pa.categoryId).not.toBeNull()
    expect(pb.categoryId).toBe(pa.categoryId)
    const cats = await listCategoriesWithCounts(db, ORG_A)
    expect(cats.filter((c) => c.name.toLowerCase() === 'panadería')).toHaveLength(1)
  })

  it('si falla el producto, la categoría nueva se deshace (misma transacción)', async () => {
    await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: input({ name: 'Con código', barcode: '111' }),
    })
    await expect(
      createProduct(db, {
        orgId: ORG_A,
        userId: USER,
        input: input({ name: 'Repetido', barcode: '111', categoryName: 'Fantasma' }),
      }),
    ).rejects.toThrow()
    const cats = await listCategoriesWithCounts(db, ORG_A)
    expect(cats.some((c) => c.name === 'Fantasma')).toBe(false)
  })

  it('código de barras duplicado en la misma bodega -> violación de unicidad', async () => {
    await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: input({ name: 'Uno', barcode: '777' }),
    })
    const err = await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: input({ name: 'Dos', barcode: '777' }),
    }).catch((e: unknown) => e)
    expect(uniqueViolation(err)).toBe('product_org_barcode_uq')
  })

  it('el mismo código en OTRA bodega está permitido', async () => {
    await expect(
      createProduct(db, {
        orgId: ORG_B,
        userId: USER,
        input: input({ name: 'Uno', barcode: '777' }),
      }),
    ).resolves.toBeDefined()
  })

  it('varios productos sin código de barras conviven', async () => {
    for (const name of ['Sin A', 'Sin B']) {
      await expect(
        createProduct(db, { orgId: ORG_A, userId: USER, input: input({ name }) }),
      ).resolves.toBeDefined()
    }
  })
})

describe('updateProduct / setProductActive (aislamiento por bodega)', () => {
  it('edita un producto propio sin tocar el stock', async () => {
    const { id } = await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: input({ name: 'Editable', initialStock: 7 }),
    })
    const res = await updateProduct(db, {
      orgId: ORG_A,
      id,
      input: input({ name: 'Editado', priceCents: 450, initialStock: 999 }),
    })
    expect(res).toEqual({ id })
    expect(await rowOf(id)).toMatchObject({ name: 'Editado', priceCents: 450, stock: 7 })
  })

  it('actualizar un producto de OTRA bodega afecta 0 filas', async () => {
    const { id } = await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: input({ name: 'Intocable' }),
    })
    const res = await updateProduct(db, {
      orgId: ORG_B,
      id,
      input: input({ name: 'Hackeado', categoryName: 'Intruso' }),
    })
    expect(res).toBeNull()
    expect((await rowOf(id)).name).toBe('Intocable')
    // y tampoco deja categorías huérfanas en la bodega atacante
    expect((await listCategoriesWithCounts(db, ORG_B)).some((c) => c.name === 'Intruso')).toBe(
      false,
    )
  })

  it('desactivar un producto de OTRA bodega afecta 0 filas', async () => {
    const { id } = await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: input({ name: 'Activo' }),
    })
    expect(await setProductActive(db, { orgId: ORG_B, id, active: false })).toBe(false)
    expect((await rowOf(id)).active).toBe(true)
  })

  it('desactivar y reactivar un producto propio', async () => {
    const { id } = await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: input({ name: 'Ciclo' }),
    })
    expect(await setProductActive(db, { orgId: ORG_A, id, active: false })).toBe(true)
    expect((await rowOf(id)).active).toBe(false)
    expect(await setProductActive(db, { orgId: ORG_A, id, active: true })).toBe(true)
    expect((await rowOf(id)).active).toBe(true)
  })
})

describe('listProducts', () => {
  it('oculta inactivos por defecto, los muestra con includeInactive y filtra por bodega', async () => {
    const { id } = await createProduct(db, {
      orgId: ORG_B,
      userId: USER,
      input: input({ name: 'Listable B' }),
    })
    await setProductActive(db, { orgId: ORG_B, id, active: false })

    const active = await listProducts(db, ORG_B)
    expect(active.some((p) => p.id === id)).toBe(false)
    const all = await listProducts(db, ORG_B, { includeInactive: true })
    expect(all.some((p) => p.id === id)).toBe(true)
    expect(all.every((p) => !p.name.includes('Gaseosa'))).toBe(true)
  })

  it('busca por nombre o código de barras y trata % y _ como literales', async () => {
    await createProduct(db, {
      orgId: ORG_B,
      userId: USER,
      input: input({ name: 'Leche Gloria', barcode: 'ABC123' }),
    })
    expect((await listProducts(db, ORG_B, { query: 'gloria' })).map((p) => p.name)).toEqual([
      'Leche Gloria',
    ])
    expect((await listProducts(db, ORG_B, { query: 'abc12' })).map((p) => p.name)).toEqual([
      'Leche Gloria',
    ])
    expect(await listProducts(db, ORG_B, { query: '%' })).toEqual([])
  })
})

describe('categorías', () => {
  it('createCategory crea en la bodega propia y no en otra', async () => {
    const { id } = await createCategory(db, { orgId: ORG_A, name: 'Bebidas' })
    expect((await listCategoriesWithCounts(db, ORG_A)).some((c) => c.id === id)).toBe(true)
    expect((await listCategoriesWithCounts(db, ORG_B)).some((c) => c.id === id)).toBe(false)
  })

  it('createCategory con nombre repetido en la misma bodega viola la unicidad', async () => {
    const err = await createCategory(db, { orgId: ORG_A, name: 'Bebidas' }).catch((e: unknown) => e)
    expect(uniqueViolation(err)).toBe('category_org_name_uq')
  })

  it('createCategory permite el mismo nombre en OTRA bodega', async () => {
    await expect(createCategory(db, { orgId: ORG_B, name: 'Bebidas' })).resolves.toBeDefined()
  })

  it('borrar una categoría deja categoryId = null en sus productos', async () => {
    const { id } = await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: input({ name: 'Con categoría', categoryName: 'Temporal' }),
    })
    const cat = (await listCategoriesWithCounts(db, ORG_A)).find((c) => c.name === 'Temporal')
    expect(cat?.productCount).toBe(1)

    expect(await deleteCategory(db, { orgId: ORG_A, id: cat?.id ?? '' })).toBe(true)
    expect((await rowOf(id)).categoryId).toBeNull()
  })

  it('renombrar y borrar categorías de OTRA bodega afecta 0 filas', async () => {
    const cat = (await listCategoriesWithCounts(db, ORG_A)).find((c) => c.name === 'Panadería')
    const id = cat?.id ?? ''
    expect(await renameCategory(db, { orgId: ORG_B, id, name: 'Robada' })).toBe(false)
    expect(await deleteCategory(db, { orgId: ORG_B, id })).toBe(false)
    expect((await listCategoriesWithCounts(db, ORG_A)).some((c) => c.name === 'Panadería')).toBe(
      true,
    )
  })

  it('renombrar a un nombre existente viola la unicidad', async () => {
    await createProduct(db, {
      orgId: ORG_A,
      userId: USER,
      input: input({ name: 'X1', categoryName: 'Lácteos' }),
    })
    const cat = (await listCategoriesWithCounts(db, ORG_A)).find((c) => c.name === 'Lácteos')
    const err = await renameCategory(db, {
      orgId: ORG_A,
      id: cat?.id ?? '',
      name: 'Panadería',
    }).catch((e: unknown) => e)
    expect(uniqueViolation(err)).toBe('category_org_name_uq')
  })

  it('renombra una categoría propia', async () => {
    const cat = (await listCategoriesWithCounts(db, ORG_A)).find((c) => c.name === 'Lácteos')
    expect(
      await renameCategory(db, { orgId: ORG_A, id: cat?.id ?? '', name: 'Lácteos y más' }),
    ).toBe(true)
  })
})
