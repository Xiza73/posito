import { and, asc, eq, inArray, type SQL, sql } from 'drizzle-orm'
import {
  category,
  organization,
  organizationSettings,
  product,
  productPhoto,
  productPriceTier,
  storeSlugHistory,
} from '@/db/schema'
import type { Db } from '@/lib/db-types'
import type { PriceTier } from '@/lib/pricing'
import { isUuid } from '@/lib/product-image'
import { normalizeWhatsappNumber } from '@/lib/whatsapp-phone'

// CAPA DE DATOS PÚBLICA (sin login). Reglas, todas a propósito:
//  - Cada consulta nombra SUS columnas: jamás `select()` a secas ni `...row` (una columna nueva en
//    `product` o `organization_settings` no puede filtrarse a internet por accidente).
//  - Solo productos activos + `show_in_store`, SIEMPRE acotados por la bodega que resolvió el slug.
//  - La cantidad de stock NO sale de SQL: solo el booleano `available`.
//  - No hay datos del dueño, usuarios, costos, códigos de barras ni ventas.

export type StoreProfile = {
  /** Interno: acota las consultas. No se manda a componentes cliente. */
  orgId: string
  /** Slug vigente (en minúsculas). */
  slug: string
  tradeName: string
  address: string | null
  hours: string | null
  /** Formato wa.me: 51XXXXXXXXX. */
  whatsapp: string
}

export type StoreProduct = {
  id: string
  name: string
  categoryName: string | null
  priceCents: number
  /** Niveles por mayor, de menor a mayor cantidad. */
  tiers: PriceTier[]
  /** Base de la foto principal (src/lib/product-image.ts) o null. */
  imagePath: string | null
  /** Controla stock y está en 0 => false. Nunca se expone el número. */
  available: boolean
}

export type StoreCatalog = { categories: string[]; products: StoreProduct[] }

/** Tope defensivo de productos por respuesta pública. */
export const STORE_PRODUCT_LIMIT = 1000

const PROFILE_COLUMNS = {
  orgId: organizationSettings.organizationId,
  slug: organizationSettings.storeSlug,
  orgName: organization.name,
  tradeName: organizationSettings.tradeName,
  address: organizationSettings.address,
  hours: organizationSettings.storeHours,
  phone: organizationSettings.phone,
}

/** Perfil de la tienda que cumpla `where`, solo si está publicable (activa + WhatsApp + celular válido + slug). */
async function selectProfile(db: Db, where: SQL | undefined): Promise<StoreProfile | null> {
  const [row] = await db
    .select(PROFILE_COLUMNS)
    .from(organizationSettings)
    .innerJoin(organization, eq(organization.id, organizationSettings.organizationId))
    .where(
      and(
        where,
        eq(organizationSettings.storeEnabled, true),
        eq(organizationSettings.hasWhatsapp, true),
      ),
    )
    .limit(1)
  if (!row?.slug) return null
  const whatsapp = normalizeWhatsappNumber(row.phone)
  if (!whatsapp) return null
  return {
    orgId: row.orgId,
    slug: row.slug,
    tradeName: row.tradeName || row.orgName,
    address: row.address,
    hours: row.hours,
    whatsapp,
  }
}

/**
 * Perfil público de la tienda por slug VIGENTE (sin distinguir mayúsculas), o null si no existe,
 * está apagada, no declara WhatsApp o el teléfono del negocio no es un celular válido. Todos los
 * casos devuelven lo mismo (null): no se revela si la tienda existe.
 */
export async function getStoreProfile(db: Db, slug: string): Promise<StoreProfile | null> {
  const key = slug.trim().toLowerCase()
  if (!key || key.length > 60) return null
  return selectProfile(db, eq(organizationSettings.storeSlug, key))
}

export type StoreResolution =
  | { kind: 'active'; profile: StoreProfile }
  /** El slug es antiguo: la tienda sigue activa en `currentSlug` (redirección 308). */
  | { kind: 'moved'; currentSlug: string }

/**
 * Resuelve un slug de la URL SIN caché (consulta barata por índice): vigente -> tienda; antiguo
 * (store_slug_history) de una tienda activa -> redirección; cualquier otro caso -> null (404).
 */
export async function resolveStoreSlug(db: Db, slug: string): Promise<StoreResolution | null> {
  const key = slug.trim().toLowerCase()
  if (!key || key.length > 60) return null
  const profile = await getStoreProfile(db, key)
  if (profile) return { kind: 'active', profile }

  const [old] = await db
    .select({ organizationId: storeSlugHistory.organizationId })
    .from(storeSlugHistory)
    .where(eq(storeSlugHistory.slug, key))
  if (!old) return null
  const current = await selectProfile(
    db,
    eq(organizationSettings.organizationId, old.organizationId),
  )
  return current ? { kind: 'moved', currentSlug: current.slug } : null
}

const visible = (orgId: string) =>
  and(eq(product.organizationId, orgId), eq(product.active, true), eq(product.showInStore, true))

async function tiersByProduct(db: Db, orgId: string, productIds: string[]) {
  if (productIds.length === 0) return new Map<string, PriceTier[]>()
  const rows = await db
    .select({
      productId: productPriceTier.productId,
      minQty: productPriceTier.minQty,
      unitPriceCents: productPriceTier.unitPriceCents,
    })
    .from(productPriceTier)
    .where(
      and(
        eq(productPriceTier.organizationId, orgId),
        inArray(productPriceTier.productId, productIds),
      ),
    )
    .orderBy(asc(productPriceTier.minQty))
  const map = new Map<string, PriceTier[]>()
  for (const { productId, minQty, unitPriceCents } of rows) {
    map.set(productId, [...(map.get(productId) ?? []), { minQty, unitPriceCents }])
  }
  return map
}

const productColumns = {
  id: product.id,
  name: product.name,
  categoryName: category.name,
  priceCents: product.priceCents,
  imagePath: product.imagePath,
  // Calculado en SQL: el número de stock nunca llega a JS
  available: sql<boolean>`(not ${product.tracksStock} or ${product.stock} > 0)`,
}

/** Productos visibles de la bodega + categorías que tienen al menos uno. */
export async function getStoreCatalog(db: Db, orgId: string): Promise<StoreCatalog> {
  const rows = await db
    .select(productColumns)
    .from(product)
    .leftJoin(category, eq(category.id, product.categoryId))
    .where(visible(orgId))
    .orderBy(asc(product.name))
    .limit(STORE_PRODUCT_LIMIT)
  // Niveles solo de los productos devueltos (acotado por ids, no por toda la bodega)
  const tiers = await tiersByProduct(
    db,
    orgId,
    rows.map((r) => r.id),
  )
  const products: StoreProduct[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    categoryName: r.categoryName,
    priceCents: r.priceCents,
    tiers: tiers.get(r.id) ?? [],
    imagePath: r.imagePath,
    available: r.available === true,
  }))
  const categories = [
    ...new Set(products.flatMap((p) => (p.categoryName ? [p.categoryName] : []))),
  ].sort((a, b) => a.localeCompare(b, 'es-PE'))
  return { categories, products }
}

/**
 * Fotos extra (bases de Storage, en orden) de un producto visible de ESA bodega. Vacío si el
 * producto no es visible. El llamador solo la usa con ids que ya están en el catálogo.
 */
export async function getStoreGallery(db: Db, orgId: string, productId: string): Promise<string[]> {
  if (!isUuid(productId)) return []
  const rows = await db
    .select({ imagePath: productPhoto.imagePath })
    .from(productPhoto)
    .innerJoin(product, eq(product.id, productPhoto.productId))
    .where(and(visible(orgId), eq(productPhoto.productId, productId)))
    .orderBy(asc(productPhoto.position))
  return rows.map((r) => r.imagePath)
}
