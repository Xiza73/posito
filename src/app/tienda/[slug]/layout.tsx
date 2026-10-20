import { notFound } from 'next/navigation'
import { StoreShell } from '@/features/tienda/components/store-shell'
import { getCachedCatalog, resolveStore } from '@/features/tienda/data/cached'
import { toPublicCatalog } from '@/features/tienda/lib/public-catalog'
import { publicImageBase } from '@/lib/product-image'

// Tienda PÚBLICA (sin login ni sesión): no llama cookies()/headers() ni helpers de sesión. Primero
// resuelve el slug SIN caché (un slug inventado = 404 sin tocar el Data Cache); solo entonces lee
// el catálogo cacheado por bodega. Al navegador solo viajan campos públicos y URLs de fotos.
export default async function TiendaLayout({
  params,
  children,
}: {
  params: Promise<{ slug: string }>
  children: React.ReactNode
}) {
  const { slug } = await params
  const resolved = await resolveStore(slug)
  if (!resolved) notFound()
  // Slug antiguo: la página (que conoce la subruta) responde la redirección 308
  if (resolved.kind === 'moved') return children

  const { profile } = resolved
  const catalog = toPublicCatalog(
    await getCachedCatalog(profile.orgId),
    publicImageBase(process.env.SUPABASE_URL),
  )

  // Tema Cielo fijo: la tienda pública es siempre clara, sin importar el tema del back-office
  return (
    <div data-theme="cielo" className="min-h-dvh overflow-x-clip bg-page text-ink">
      <StoreShell
        slug={profile.slug}
        store={{
          tradeName: profile.tradeName,
          address: profile.address,
          hours: profile.hours,
          whatsapp: profile.whatsapp,
          metroDelivery: profile.metroDelivery,
        }}
        catalog={catalog}
      >
        {children}
      </StoreShell>
    </div>
  )
}
