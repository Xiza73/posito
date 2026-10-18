import type { PriceTier } from '@/lib/pricing'
import { type ImageSize, productImageUrl } from '@/lib/product-image'
import type { StoreCatalog } from '../data/store'

// Lo que viaja al NAVEGADOR. Nunca rutas de Storage crudas (`${orgId}/${productId}/${uuid}`) ni
// ids de bodega: solo las URLs públicas ya resueltas. (La URL final sí contiene la ruta; es el
// diseño del bucket público y se acepta, ver CLAUDE.md.)

export type PublicProduct = {
  id: string
  name: string
  categoryName: string | null
  priceCents: number
  tiers: PriceTier[]
  /** Miniatura 240 o null (placeholder). */
  thumbUrl: string | null
  available: boolean
}

export type PublicCatalog = { categories: string[]; products: PublicProduct[] }

export type PublicImage = { thumbUrl: string; imageUrl: string }

export function toPublicCatalog(catalog: StoreCatalog, imageBase: string | null): PublicCatalog {
  return {
    categories: catalog.categories,
    products: catalog.products.map((p) => ({
      id: p.id,
      name: p.name,
      categoryName: p.categoryName,
      priceCents: p.priceCents,
      tiers: p.tiers,
      thumbUrl: productImageUrl(imageBase, p.imagePath, 240),
      available: p.available,
    })),
  }
}

/** Fotos de la ficha (principal primero, luego la galería) como URLs; descarta las que no resuelven. */
export function toPublicImages(
  paths: readonly (string | null)[],
  imageBase: string | null,
): PublicImage[] {
  const url = (path: string | null, size: ImageSize) => productImageUrl(imageBase, path, size)
  return paths.flatMap((path) => {
    const thumbUrl = url(path, 240)
    const imageUrl = url(path, 800)
    return thumbUrl && imageUrl ? [{ thumbUrl, imageUrl }] : []
  })
}
