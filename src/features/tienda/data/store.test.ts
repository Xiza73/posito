// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getStoreCatalog, getStoreGallery, getStoreProfile, resolveStoreSlug } from './store'

const db = drizzle(new PGlite(), { schema, casing: 'snake_case' })

const ORG_A = 'orgAAAA1'
const ORG_B = 'orgBBBB2'
const ORG_OFF = 'orgOFF03'
const PHOTO = (org: string, p: string, n: number) =>
  `${org}/${p}/00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

let ids: Record<string, string> = {}

async function addProduct(
  orgId: string,
  name: string,
  over: Partial<typeof schema.product.$inferInsert> = {},
) {
  const [p] = await db
    .insert(schema.product)
    .values({ organizationId: orgId, name, nameKey: name.toLowerCase(), priceCents: 300, ...over })
    .returning({ id: schema.product.id })
  return p.id
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
  const now = new Date()
  await db.insert(schema.organization).values([
    { id: ORG_A, name: 'Bodega A', slug: 'a', createdAt: now },
    { id: ORG_B, name: 'Bodega B', slug: 'b', createdAt: now },
    { id: ORG_OFF, name: 'Apagada', slug: 'off', createdAt: now },
  ])
  await db.insert(schema.organizationSettings).values([
    {
      organizationId: ORG_A,
      storeEnabled: true,
      hasWhatsapp: true,
      storeSlug: 'bodega-a',
      storeHours: 'Lun a Sáb 8-21',
      tradeName: 'Don Pepe',
      address: 'Av. Lima 123',
      phone: '+51 987 654 321',
    },
    {
      organizationId: ORG_B,
      storeEnabled: true,
      hasWhatsapp: true,
      storeSlug: 'bodega-b',
      phone: '912345678',
    },
    {
      organizationId: ORG_OFF,
      storeEnabled: false,
      hasWhatsapp: true,
      storeSlug: 'apagada',
      phone: '912345678',
    },
  ])

  const [cat] = await db
    .insert(schema.category)
    .values({ organizationId: ORG_A, name: 'Bebidas', nameKey: 'bebidas' })
    .returning({ id: schema.category.id })

  const visible = await addProduct(ORG_A, 'Inca Kola', {
    categoryId: cat.id,
    stock: 7,
    barcode: '7750001',
    imagePath: PHOTO(ORG_A, '11111111-1111-4111-8111-111111111111', 1),
  })
  ids = {
    visible,
    hidden: await addProduct(ORG_A, 'Oculto', { showInStore: false }),
    inactive: await addProduct(ORG_A, 'Inactivo', { active: false }),
    soldOut: await addProduct(ORG_A, 'Agotado', { stock: 0 }),
    service: await addProduct(ORG_A, 'Café al paso', { tracksStock: false, stock: 0 }),
    other: await addProduct(ORG_B, 'De otra bodega'),
  }
  await db.insert(schema.productPriceTier).values([
    { organizationId: ORG_A, productId: visible, minQty: 12, unitPriceCents: 240 },
    { organizationId: ORG_A, productId: visible, minQty: 6, unitPriceCents: 270 },
  ])
  await db.insert(schema.productPhoto).values([
    {
      id: '00000000-0000-4000-8000-000000000002',
      organizationId: ORG_A,
      productId: visible,
      imagePath: PHOTO(ORG_A, visible, 2),
      position: 1,
    },
    {
      id: '00000000-0000-4000-8000-000000000003',
      organizationId: ORG_A,
      productId: visible,
      imagePath: PHOTO(ORG_A, visible, 3),
      position: 0,
    },
  ])
})

describe('getStoreProfile', () => {
  it('resuelve por slug sin distinguir mayúsculas y normaliza el WhatsApp', async () => {
    const p = await getStoreProfile(db, 'Bodega-A')
    expect(p).toEqual({
      orgId: ORG_A,
      slug: 'bodega-a',
      tradeName: 'Don Pepe',
      address: 'Av. Lima 123',
      hours: 'Lun a Sáb 8-21',
      whatsapp: '51987654321',
    })
  })

  it('usa el nombre de la organization si no hay nombre comercial', async () => {
    expect((await getStoreProfile(db, 'bodega-b'))?.tradeName).toBe('Bodega B')
  })

  it('tienda apagada, slug desconocido o vacío = null', async () => {
    expect(await getStoreProfile(db, 'apagada')).toBeNull()
    expect(await getStoreProfile(db, 'no-existe')).toBeNull()
    expect(await getStoreProfile(db, '')).toBeNull()
  })

  it('sin WhatsApp declarado o con teléfono inválido = null', async () => {
    await db.update(schema.organizationSettings).set({ hasWhatsapp: false }).where(eqOrg(ORG_B))
    expect(await getStoreProfile(db, 'bodega-b')).toBeNull()
    await db
      .update(schema.organizationSettings)
      .set({ hasWhatsapp: true, phone: '012345' })
      .where(eqOrg(ORG_B))
    expect(await getStoreProfile(db, 'bodega-b')).toBeNull()
    await db.update(schema.organizationSettings).set({ phone: null }).where(eqOrg(ORG_B))
    expect(await getStoreProfile(db, 'bodega-b')).toBeNull()
    await db.update(schema.organizationSettings).set({ phone: '912345678' }).where(eqOrg(ORG_B))
    expect(await getStoreProfile(db, 'bodega-b')).not.toBeNull()
  })
})

import { eq } from 'drizzle-orm'

function eqOrg(orgId: string) {
  return eq(schema.organizationSettings.organizationId, orgId)
}

describe('getStoreCatalog', () => {
  it('solo devuelve productos activos, visibles y de esa bodega', async () => {
    const { products, categories } = await getStoreCatalog(db, ORG_A)
    expect(products.map((p) => p.name).sort()).toEqual(['Agotado', 'Café al paso', 'Inca Kola'])
    expect(categories).toEqual(['Bebidas'])
    const all = JSON.stringify(products)
    expect(all).not.toContain('Oculto')
    expect(all).not.toContain('Inactivo')
    expect(all).not.toContain('De otra bodega')
  })

  it('calcula la disponibilidad en SQL y no expone stock', async () => {
    const { products } = await getStoreCatalog(db, ORG_A)
    const byName = Object.fromEntries(products.map((p) => [p.name, p]))
    expect(byName['Inca Kola'].available).toBe(true)
    expect(byName.Agotado.available).toBe(false)
    expect(byName['Café al paso'].available).toBe(true)
    for (const p of products) {
      expect(Object.keys(p).sort()).toEqual(
        ['available', 'categoryName', 'id', 'imagePath', 'name', 'priceCents', 'tiers'].sort(),
      )
    }
    // Ni el stock (7) ni el código de barras llegan al JSON público
    expect(JSON.stringify(products)).not.toMatch(/stock|barcode|7750001/i)
  })

  it('devuelve los niveles por mayor ordenados', async () => {
    const { products } = await getStoreCatalog(db, ORG_A)
    expect(products.find((p) => p.name === 'Inca Kola')?.tiers).toEqual([
      { minQty: 6, unitPriceCents: 270 },
      { minQty: 12, unitPriceCents: 240 },
    ])
  })
})

describe('getStoreGallery', () => {
  it('devuelve las fotos extra en orden', async () => {
    expect(await getStoreGallery(db, ORG_A, ids.visible)).toEqual([
      PHOTO(ORG_A, ids.visible, 3),
      PHOTO(ORG_A, ids.visible, 2),
    ])
  })

  it('oculto, inactivo, de otra bodega o con id inválido = vacío', async () => {
    expect(await getStoreGallery(db, ORG_A, ids.hidden)).toEqual([])
    expect(await getStoreGallery(db, ORG_A, ids.inactive)).toEqual([])
    expect(await getStoreGallery(db, ORG_B, ids.visible)).toEqual([])
    expect(await getStoreGallery(db, ORG_A, 'no-es-uuid')).toEqual([])
  })
})

describe('resolveStoreSlug', () => {
  it('slug vigente = active (sin distinguir mayúsculas); apagada o inexistente = null', async () => {
    const r = await resolveStoreSlug(db, 'BODEGA-A')
    expect(r?.kind).toBe('active')
    expect(r?.kind === 'active' && r.profile.slug).toBe('bodega-a')
    expect(await resolveStoreSlug(db, 'apagada')).toBeNull()
    expect(await resolveStoreSlug(db, 'zzz')).toBeNull()
  })

  it('slug antiguo de una tienda activa = moved al slug actual', async () => {
    await db.insert(schema.storeSlugHistory).values([
      { slug: 'bodega-vieja', organizationId: ORG_A },
      { slug: 'vieja-apagada', organizationId: ORG_OFF },
    ])
    expect(await resolveStoreSlug(db, 'Bodega-Vieja')).toEqual({
      kind: 'moved',
      currentSlug: 'bodega-a',
    })
    // Si la tienda dueña está apagada, el slug antiguo tampoco revela nada
    expect(await resolveStoreSlug(db, 'vieja-apagada')).toBeNull()
  })

  it('un slug que es vigente de una tienda apagada no cae al historial', async () => {
    expect(await resolveStoreSlug(db, 'apagada')).toBeNull()
  })
})
