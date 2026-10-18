import 'server-only'
import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import { db } from '@/lib/db'
import { isUuid } from '@/lib/product-image'
import { STORE_SLUG_RE } from '@/lib/store-slug'
import { storeTag } from '@/lib/store-tag'
import { getStoreCatalog, getStoreGallery, resolveStoreSlug } from './store'

// Lecturas públicas. Dos capas, a propósito:
//  1. `resolveStore(slug)`: consulta BARATA y SIN caché de Data Cache (índice único) envuelta en
//     `React.cache` (se deduplica dentro de la petición: layout, página y generateMetadata).
//     Un slug inventado termina aquí en 404 y NUNCA crea una entrada del Data Cache.
//  2. Solo con una bodega ya resuelta se usa `unstable_cache`, con clave = orgId (+ productId solo
//     para ids que están en el catálogo). El número de claves queda acotado por el tamaño real de
//     los datos, no por lo que un visitante escriba en la URL.
// Por qué `unstable_cache` y no `export const revalidate`: el layout raíz llama a `cookies()` (tema)
// y vuelve dinámica TODA ruta, así que el ISR por página no aplica. Etiqueta por bodega
// (`tienda:<orgId>`, src/lib/store-tag.ts): las Server Actions que cambian lo que ve la tienda
// llaman `revalidateStore()`; además cada entrada vence a los 30 s.

const REVALIDATE_SECONDS = 30

const validSlug = (slug: string) => STORE_SLUG_RE.test(slug.toLowerCase())

export const resolveStore = cache(async (slug: string) =>
  validSlug(slug) ? resolveStoreSlug(db, slug) : null,
)

export const getCachedCatalog = cache(async (orgId: string) =>
  unstable_cache(() => getStoreCatalog(db, orgId), ['tienda-catalogo', orgId], {
    revalidate: REVALIDATE_SECONDS,
    tags: [storeTag(orgId)],
  })(),
)

/** SOLO para ids que ya están en el catálogo cacheado (acota las claves del caché). */
export const getCachedGallery = cache(async (orgId: string, productId: string) =>
  !isUuid(productId)
    ? []
    : unstable_cache(
        () => getStoreGallery(db, orgId, productId),
        ['tienda-galeria', orgId, productId],
        {
          revalidate: REVALIDATE_SECONDS,
          tags: [storeTag(orgId)],
        },
      )(),
)
