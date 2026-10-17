import 'server-only'
import { and, asc, eq } from 'drizzle-orm'
import { category, product, productPriceTier } from '@/db/schema'
import { db } from '@/lib/db'
import type { PriceTier } from '@/lib/pricing'
import type { CatalogProduct } from '../lib/catalog'

export type Catalog = { products: CatalogProduct[]; categories: string[] }

/** Productos activos de la bodega + categorías que tienen al menos un producto activo. */
export async function getCatalog(organizationId: string): Promise<Catalog> {
  const rows = await db
    .select({
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      category: category.name,
      priceCents: product.priceCents,
      stock: product.stock,
      tracksStock: product.tracksStock,
      imagePath: product.imagePath,
    })
    .from(product)
    .leftJoin(category, eq(category.id, product.categoryId))
    .where(and(eq(product.organizationId, organizationId), eq(product.active, true)))
    .orderBy(asc(product.name))

  const tierRows = await db
    .select({
      productId: productPriceTier.productId,
      minQty: productPriceTier.minQty,
      unitPriceCents: productPriceTier.unitPriceCents,
    })
    .from(productPriceTier)
    .where(eq(productPriceTier.organizationId, organizationId))
    .orderBy(asc(productPriceTier.minQty))
  const tiersOf = new Map<string, PriceTier[]>()
  for (const { productId, ...tier } of tierRows) {
    tiersOf.set(productId, [...(tiersOf.get(productId) ?? []), tier])
  }

  const categories = [...new Set(rows.flatMap((r) => (r.category ? [r.category] : [])))].sort(
    (a, b) => a.localeCompare(b, 'es'),
  )
  return {
    products: rows.map((r) => ({ ...r, tiers: tiersOf.get(r.id) ?? [] })),
    categories,
  }
}
