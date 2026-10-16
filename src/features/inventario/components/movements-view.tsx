'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import type { MovementRow } from '../data/inventory'
import { type MovementFilters as Filters, movementQueryString } from '../lib/filters'
import { MovementsFilters } from './movements-filters'
import { MovementsList } from './movements-list'

type Props = {
  rows: MovementRow[]
  filters: Filters
  page: number
  hasNext: boolean
  today: string
  products: { id: string; name: string; active: boolean }[]
  /** null = el rol no filtra por usuario. */
  users: { id: string; name: string }[] | null
  viewer: { userId: string; seesAllSales: boolean }
}

const BTN =
  'inline-flex h-10 cursor-pointer items-center rounded-ctl border border-line px-4 font-medium text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50'

/** Orquesta filtros (en la URL), historial y paginación. */
export function MovementsView({
  rows,
  filters,
  page,
  hasNext,
  today,
  products,
  users,
  viewer,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Mientras llega la lista nueva, la actual está obsoleta.
  const [isPending, startTransition] = useTransition()

  /** Reescribe parámetros conservando los demás; cambiar un filtro vuelve a la página 1. */
  function navigate(changes: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    if (!('pagina' in changes)) params.delete('pagina')
    for (const [key, value] of Object.entries(changes)) params.set(key, value)
    for (const [key, value] of [...params])
      if (value === '' || (key === 'pagina' && value === '1')) params.delete(key)
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  return (
    <>
      <MovementsFilters
        // Inputs no controlados: remontar si la URL cambia (ej. botón "atrás") para no desincronizar
        key={movementQueryString(filters)}
        filters={filters}
        today={today}
        products={products}
        users={users}
        onChange={navigate}
        onClear={() => startTransition(() => router.replace(pathname, { scroll: false }))}
      />

      <div
        aria-busy={isPending}
        inert={isPending}
        className={`flex flex-col gap-4 transition-opacity ${isPending ? 'opacity-50' : ''}`}
      >
        {isPending ? (
          <p role="status" className="text-muted text-sm">
            Cargando…
          </p>
        ) : null}

        <MovementsList rows={rows} viewer={viewer} />

        {page > 1 || hasNext ? (
          <nav aria-label="Paginación" className="flex items-center justify-between gap-2.5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => navigate({ pagina: String(page - 1) })}
              className={BTN}
            >
              Anterior
            </button>
            <span className="text-muted text-sm">Página {page}</span>
            <button
              type="button"
              disabled={!hasNext}
              onClick={() => navigate({ pagina: String(page + 1) })}
              className={BTN}
            >
              Siguiente
            </button>
          </nav>
        ) : null}
      </div>
    </>
  )
}
