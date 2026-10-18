import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { CatalogView } from '@/features/tienda/components/catalog-view'
import { resolveStore } from '@/features/tienda/data/cached'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolved = await resolveStore((await params).slug)
  // Sin tienda: título genérico (el layout responde 404); nada interno en los metadatos
  if (resolved?.kind !== 'active') return { title: 'Tienda' }
  return {
    title: resolved.profile.tradeName,
    description: `Catálogo de ${resolved.profile.tradeName}. Arma tu pedido y envíalo por WhatsApp.`,
  }
}

export default async function TiendaPage({ params }: Props) {
  const resolved = await resolveStore((await params).slug)
  if (!resolved) notFound()
  // 308: los QR/enlaces impresos con el slug anterior siguen funcionando
  if (resolved.kind === 'moved') permanentRedirect(`/tienda/${resolved.currentSlug}`)
  return <CatalogView />
}
