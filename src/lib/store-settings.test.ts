// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getSettings, updateSettings } from './settings'
import {
  countStoreProducts,
  DEFAULT_STORE_SETTINGS,
  getStoreSettings,
  type StoreSettings,
  updateStoreSettings,
} from './store-settings'

const db = drizzle(new PGlite(), { schema, casing: 'snake_case' })
const A = 'org-a'
const B = 'org-b'
const input: StoreSettings = {
  storeEnabled: true,
  hasWhatsapp: true,
  storeSlug: 'mi-tienda',
  storeHours: '8 a 20',
  metroDeliveryEnabled: true,
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
  const now = new Date()
  await db.insert(schema.organization).values([
    { id: A, name: 'A', slug: 'a', createdAt: now },
    { id: B, name: 'B', slug: 'b', createdAt: now },
  ])
})

describe('store settings', () => {
  it('sin fila = apagada', async () => {
    expect(await getStoreSettings(db, A)).toEqual(DEFAULT_STORE_SETTINGS)
  })

  it('upsert, y no pisa los otros ajustes', async () => {
    await updateSettings(db, A, { requireSaleApproval: true })
    expect(await updateStoreSettings(db, A, input)).toEqual({ ok: true })
    expect(await getStoreSettings(db, A)).toEqual(input)
    expect((await getSettings(db, A)).requireSaleApproval).toBe(true)
    // y guardar otros ajustes no apaga la tienda
    await updateSettings(db, A, { allowManualPrice: true })
    expect(await getStoreSettings(db, A)).toEqual(input)
  })

  it('guardar el flag del Metropolitano no pisa otras columnas ni ajustes', async () => {
    await db
      .update(schema.organizationSettings)
      .set({ tradeName: 'Don Pepe' })
      .where(eq(schema.organizationSettings.organizationId, A))
    await updateStoreSettings(db, A, { ...input, metroDeliveryEnabled: false })
    expect((await getStoreSettings(db, A)).metroDeliveryEnabled).toBe(false)
    await updateSettings(db, A, { allowManualPrice: false })
    expect((await getStoreSettings(db, A)).metroDeliveryEnabled).toBe(false)
    await updateStoreSettings(db, A, input)
    const [row] = await db
      .select()
      .from(schema.organizationSettings)
      .where(eq(schema.organizationSettings.organizationId, A))
    expect(row.tradeName).toBe('Don Pepe')
    expect(row.metroDeliveryEnabled).toBe(true)
    expect((await getSettings(db, A)).requireSaleApproval).toBe(true)
  })

  it('slug repetido en otra bodega = slug_taken', async () => {
    expect(await updateStoreSettings(db, B, input)).toEqual({ ok: false, error: 'slug_taken' })
    expect(await getStoreSettings(db, B)).toEqual(DEFAULT_STORE_SETTINGS)
  })

  it('la misma bodega puede volver a guardar su slug', async () => {
    expect(await updateStoreSettings(db, A, { ...input, storeHours: null })).toEqual({ ok: true })
  })
})

describe('historial de slugs', () => {
  const history = async () =>
    (await db.select().from(schema.storeSlugHistory)).map((h) => `${h.organizationId}:${h.slug}`)

  it('al cambiar de slug, el anterior pasa al historial', async () => {
    await updateStoreSettings(db, A, { ...input, storeSlug: 'nuevo-a' })
    expect(await history()).toContain(`${A}:mi-tienda`)
  })

  it('otra bodega NO puede tomar un slug del historial ni uno vigente', async () => {
    expect(await updateStoreSettings(db, B, { ...input, storeSlug: 'mi-tienda' })).toEqual({
      ok: false,
      error: 'slug_taken',
    })
    expect(await updateStoreSettings(db, B, { ...input, storeSlug: 'nuevo-a' })).toEqual({
      ok: false,
      error: 'slug_taken',
    })
  })

  it('la dueña puede recuperar su slug antiguo (sale del historial; el actual entra)', async () => {
    expect(await updateStoreSettings(db, A, { ...input, storeSlug: 'mi-tienda' })).toEqual({
      ok: true,
    })
    const h = await history()
    expect(h).not.toContain(`${A}:mi-tienda`)
    expect(h).toContain(`${A}:nuevo-a`)
  })

  it('guardar sin cambiar el slug no toca el historial', async () => {
    const before = await history()
    await updateStoreSettings(db, A, { ...input, storeSlug: 'mi-tienda', storeHours: 'otro' })
    expect(await history()).toEqual(before)
  })

  it('quitar el slug lo manda al historial', async () => {
    await updateStoreSettings(db, A, { ...input, storeEnabled: false, storeSlug: null })
    expect(await history()).toContain(`${A}:mi-tienda`)
    expect(
      (
        await db
          .select()
          .from(schema.organizationSettings)
          .where(eq(schema.organizationSettings.organizationId, A))
      )[0].storeSlug,
    ).toBeNull()
  })
})

describe('countStoreProducts', () => {
  it('cuenta solo activos con showInStore de esa bodega', async () => {
    const base = { organizationId: A, priceCents: 100 }
    await db.insert(schema.product).values([
      { ...base, name: 'a', nameKey: 'a' },
      { ...base, name: 'b', nameKey: 'b', showInStore: false },
      { ...base, name: 'c', nameKey: 'c', active: false },
      { organizationId: B, priceCents: 100, name: 'd', nameKey: 'd' },
    ])
    expect(await countStoreProducts(db, A)).toBe(1)
    expect(await countStoreProducts(db, B)).toBe(1)
  })
})
