import 'server-only'
import { and, asc, eq } from 'drizzle-orm'
import { category, product } from '@/db/schema'
import { db } from '@/lib/db'
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
    })
    .from(product)
    .leftJoin(category, eq(category.id, product.categoryId))
    .where(and(eq(product.organizationId, organizationId), eq(product.active, true)))
    .orderBy(asc(product.name))

  const categories = [...new Set(rows.flatMap((r) => (r.category ? [r.category] : [])))].sort(
    (a, b) => a.localeCompare(b, 'es'),
  )
  return { products: rows, categories }
}
