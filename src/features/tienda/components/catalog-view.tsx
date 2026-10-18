'use client'

import Link from 'next/link'
import { useState } from 'react'
import { formatCents } from '@/lib/format'
import { nameKey } from '@/lib/name-key'
import type { PublicProduct } from '../lib/public-catalog'
import { tiersHint } from '../lib/tiers-hint'
import { StoreImage } from './store-image'
import { useStore } from './store-shell'

export function AvailabilityBadge({ available }: { available: boolean }) {
  return available ? (
    <span className="text-ok text-xs">Disponible</span>
  ) : (
    <span className="rounded-full border border-line px-2 py-0.5 text-muted text-xs">Agotado</span>
  )
}

function ProductCard({ p }: { p: PublicProduct }) {
  const { slug, add } = useStore()
  const hint = tiersHint(p.tiers)
  return (
    <li className="flex flex-col overflow-hidden rounded-card border border-line bg-surface">
      <Link href={`/tienda/${slug}/p/${p.id}`} className="flex flex-1 flex-col">
        <StoreImage
          src={p.thumbUrl}
          name={p.name}
          width={240}
          height={240}
          className="aspect-square w-full rounded-none border-0 border-line border-b"
        />
        <div className="flex flex-col gap-1 p-3">
          <h3 className="font-medium text-sm leading-snug">{p.name}</h3>
          <p className="font-mono font-semibold">{formatCents(p.priceCents)}</p>
          {hint ? <p className="text-accent text-xs">{hint}</p> : null}
          <AvailabilityBadge available={p.available} />
        </div>
      </Link>
      <div className="p-3 pt-0">
        <button
          type="button"
          disabled={!p.available}
          onClick={() => add(p.id)}
          aria-label={`Agregar ${p.name} al pedido`}
          className="h-10 w-full cursor-pointer rounded-ctl bg-accent font-semibold text-accent-ink text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          Agregar
        </button>
      </div>
    </li>
  )
}

/** Catálogo: búsqueda, chips de categoría y cuadrícula. Los datos vienen del layout (una sola copia). */
export function CatalogView() {
  const { catalog } = useStore()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)

  const q = nameKey(query)
  const shown = catalog.products.filter(
    (p) => (!category || p.categoryName === category) && (!q || nameKey(p.name).includes(q)),
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="st-search" className="sr-only">
          Buscar productos
        </label>
        <input
          id="st-search"
          type="search"
          placeholder="Buscar productos"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          className="h-11 w-full rounded-ctl border border-line bg-surface px-3"
        />
      </div>

      {catalog.categories.length > 0 ? (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Categorías</legend>
          {[null, ...catalog.categories].map((c) => (
            <button
              key={c ?? '__all'}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={`h-9 cursor-pointer rounded-full border px-3 text-sm ${
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
        <p className="py-10 text-center text-muted text-sm">No encontramos productos.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {shown.map((p) => (
            <ProductCard key={p.id} p={p} />
          ))}
        </ul>
      )}
    </div>
  )
}
