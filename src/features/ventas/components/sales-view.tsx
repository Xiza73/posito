'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import type { SaleListRow, SalesSummary } from '../data/sales'
import { EXPORT_LIMIT, type SalesFilters as Filters, salesQueryString } from '../lib/filters'
import { SalesFilters } from './sales-filters'
import { SalesList } from './sales-list'
import { SalesTotals } from './sales-totals'

type Props = {
  rows: SaleListRow[]
  summary: SalesSummary
  filters: Filters
  page: number
  hasNext: boolean
  today: string
  products: { id: string; name: string; active: boolean }[]
  /** null = el rol solo ve sus propias ventas (sin filtro de cajero). */
  cashiers: { id: string; name: string }[] | null
}

const BTN =
  'inline-flex h-10 cursor-pointer items-center rounded-ctl border border-line px-4 font-medium text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50'

/** Orquesta filtros (en la URL), totales, lista, paginación y exportación. */
export function SalesView({
  rows,
  summary,
  filters,
  page,
  hasNext,
  today,
  products,
  cashiers,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Mientras llega la lista nueva, la actual está obsoleta: no se puede actuar sobre sus filas.
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

  const matching = summary.count + summary.voidedCount + summary.pendingCount
  const exportHref = `/ventas/export?${salesQueryString(filters)}`

  return (
    <>
      <SalesFilters
        // Inputs no controlados: remontar si la URL cambia (ej. botón "atrás") para no desincronizar
        key={salesQueryString(filters)}
        filters={filters}
        today={today}
        products={products}
        cashiers={cashiers}
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

        <SalesTotals summary={summary} />

        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <p className="text-muted text-sm">
            {matching === 0
              ? 'Sin resultados'
              : `${matching} ${matching === 1 ? 'venta' : 'ventas'} en el rango`}
          </p>
          {matching > 0 ? (
            <a href={exportHref} download className={BTN}>
              Exportar CSV
            </a>
          ) : null}
        </div>
        {matching > EXPORT_LIMIT ? (
          <p role="note" className="text-muted text-sm">
            El archivo incluirá solo las {EXPORT_LIMIT} ventas más recientes. Acota el rango de
            fechas para exportarlas todas.
          </p>
        ) : null}

        <SalesList rows={rows} showCashier={cashiers !== null} />

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
