import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { ProductDetail } from '@/features/tienda/components/product-detail'
import { getCachedCatalog, getCachedGallery, resolveStore } from '@/features/tienda/data/cached'
import { toPublicCatalog, toPublicImages } from '@/features/tienda/lib/public-catalog'
import { isUuid, publicImageBase } from '@/lib/product-image'

type Props = { params: Promise<{ slug: string; productId: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, productId } = await params
  const resolved = await resolveStore(slug)
  if (resolved?.kind !== 'active') return { title: 'Tienda' }
  const found = (await getCachedCatalog(resolved.profile.orgId)).products.find(
    (p) => p.id === productId,
  )
  if (!found) return { title: 'Tienda' }
  return { title: `${found.name} - ${resolved.profile.tradeName}` }
}

export default async function TiendaProductPage({ params }: Props) {
  const { slug, productId } = await params
  const resolved = await resolveStore(slug)
  if (!resolved || !isUuid(productId)) notFound()
  if (resolved.kind === 'moved') {
    permanentRedirect(`/tienda/${resolved.currentSlug}/p/${productId}`)
  }

  // El producto se busca en el catálogo cacheado: oculto, inactivo, de otra bodega o inexistente = 404
  const { orgId } = resolved.profile
  const catalog = await getCachedCatalog(orgId)
  const raw = catalog.products.find((p) => p.id === productId)
  if (!raw) notFound()

  const imageBase = publicImageBase(process.env.SUPABASE_URL)
  const product = toPublicCatalog({ categories: [], products: [raw] }, imageBase).products[0]
  // Galería: clave de caché solo para ids que existen en el catálogo
  const gallery = await getCachedGallery(orgId, raw.id)
  return (
    <ProductDetail
      product={product}
      images={toPublicImages([raw.imagePath, ...gallery], imageBase)}
    />
  )
}
