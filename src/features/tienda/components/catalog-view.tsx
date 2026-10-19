'use client'

import Link from 'next/link'
import { useState } from 'react'
import { formatCents } from '@/lib/format'
import { nameKey } from '@/lib/name-key'
import type { PublicProduct } from '../lib/public-catalog'
import { tiersHint } from '../lib/tiers-hint'
import { CheckIcon, PlusIcon, WhatsappIcon } from './icons'
import { StoreImage } from './store-image'
import { useStore } from './store-shell'

/** Línea de disponibilidad de la ficha: check verde o aviso de agotado. */
export function AvailabilityLine({ available }: { available: boolean }) {
  return available ? (
    <p className="flex items-center gap-1.5 font-medium text-ok text-sm">
      <CheckIcon className="size-4" />
      Disponible
    </p>
  ) : (
    <p className="font-medium text-muted text-sm">Agotado por ahora</p>
  )
}

function ProductCard({ p }: { p: PublicProduct }) {
  const { slug, add } = useStore()
  const hint = tiersHint(p.tiers)
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-shadow focus-within:shadow-pop hover:shadow-pop">
      <Link href={`/tienda/${slug}/p/${p.id}`} className="flex flex-1 flex-col">
        <div className="relative">
          <StoreImage
            src={p.thumbUrl}
            name={p.name}
            width={240}
            height={240}
            className="aspect-square w-full rounded-t-2xl"
          />
          {p.available ? null : (
            <span className="absolute top-2 left-2 rounded-full bg-ink px-2.5 py-1 font-semibold text-surface text-xs">
              Agotado
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1 p-3 pb-2">
          <h3 className="line-clamp-2 font-medium text-sm leading-snug">{p.name}</h3>
          <p className="font-bold text-ink text-lg">{formatCents(p.priceCents)}</p>
          {hint ? <p className="font-medium text-ok text-xs">{hint}</p> : null}
        </div>
      </Link>
      <div className="p-3 pt-1">
        <button
          type="button"
          disabled={!p.available}
          onClick={() => add(p.id)}
          aria-label={`Agregar ${p.name} al pedido`}
          className="flex h-10 w-full cursor-pointer items-center justify-center gap-1.5 rounded-full bg-accent font-semibold text-accent-ink text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PlusIcon className="size-4" />
          Agregar
        </button>
      </div>
    </li>
  )
}

/** Banner de bienvenida: qué modalidades de entrega ofrece la tienda. */
function Hero() {
  const { store } = useStore()
  const modes = [
    'Recojo en tienda',
    'Delivery',
    ...(store.metroDelivery ? ['Estación del Metropolitano'] : []),
  ]
  return (
    <section
      aria-labelledby="st-hero"
      className="flex items-center justify-between gap-4 rounded-3xl bg-accent-soft p-5 md:p-7"
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 id="st-hero" className="font-bold text-ink text-xl leading-tight md:text-3xl">
          Haz tu pedido por WhatsApp
        </h1>
        <p className="text-muted text-sm md:text-base">{modes.join(' · ')}</p>
      </div>
      <span
        aria-hidden="true"
        className="grid size-14 flex-none place-items-center rounded-2xl bg-surface text-ok md:size-20"
      >
        <WhatsappIcon className="size-8 md:size-11" />
      </span>
    </section>
  )
}

/** Catálogo: banner, categorías y cuadrícula. Los datos vienen del layout (una sola copia). */
export function CatalogView() {
  const { catalog, query } = useStore()
  const [category, setCategory] = useState<string | null>(null)

  const q = nameKey(query)
  const shown = catalog.products.filter(
    (p) => (!category || p.categoryName === category) && (!q || nameKey(p.name).includes(q)),
  )

  return (
    <div className="flex flex-col gap-5">
      <Hero />

      {catalog.categories.length > 0 ? (
        <fieldset className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
          <legend className="sr-only">Categorías</legend>
          {[null, ...catalog.categories].map((c) => (
            <button
              key={c ?? '__all'}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={`h-10 flex-none cursor-pointer whitespace-nowrap rounded-full border px-4 font-medium text-sm ${
                category === c
                  ? 'border-accent bg-accent text-accent-ink'
                  : 'border-line bg-surface text-ink'
              }`}
            >
              {c ?? 'Todos'}
            </button>
          ))}
        </fieldset>
      ) : null}

      {shown.length === 0 ? (
        <p className="py-12 text-center text-muted text-sm">No encontramos productos.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-4">
          {shown.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </ul>
      )}
    </div>
  )
}
