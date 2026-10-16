'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { StockRow, StockSummary } from '../data/inventory'
import { type StockFilters as Filters, stockQueryString } from '../lib/filters'
import { BatchIngresoDialog } from './batch-ingreso-dialog'
import { StockActionDialog, type StockTarget } from './stock-action-dialog'
import { StockFilters } from './stock-filters'
import { StockList } from './stock-list'

type Props = {
  rows: StockRow[]
  summary: StockSummary
  filters: Filters
  categories: { id: string; name: string }[]
  /** Quien puede ingresar, ajustar y contar (stock:adjust). */
  canAdjust: boolean
  /** Productos para el ingreso en lote (vacío si el rol no puede ajustar). */
  adjustable: { id: string; name: string; barcode: string | null; stock: number }[]
}

const BTN =
  'inline-flex h-11 cursor-pointer items-center rounded-ctl border border-line px-4 font-medium text-sm hover:bg-surface-2'

/** Orquesta chips de estado, filtros (en la URL), lista, exportación y diálogos. */
export function StockView({ rows, summary, filters, categories, canAdjust, adjustable }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // Mientras llega la lista nueva, la actual está obsoleta: no se puede actuar sobre sus filas.
  const [isPending, startTransition] = useTransition()
  const [target, setTarget] = useState<StockTarget | null>(null)
  const [batching, setBatching] = useState(false)

  /** Reescribe parámetros conservando los demás. */
  function navigate(changes: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(changes)) params.set(key, value)
    for (const [key, value] of [...params]) if (value === '') params.delete(key)
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  const qs = stockQueryString(filters)
  const exportHref = `/inventario/export${qs ? `?${qs}` : ''}`

  const chips = [
    { key: '', label: 'Todos', count: summary.tracked, tone: '' },
    { key: 'bajo', label: 'Stock bajo', count: summary.low, tone: 'text-warn' },
    { key: 'agotado', label: 'Agotados', count: summary.out, tone: 'text-bad' },
  ] as const

  return (
    <>
      <fieldset className="flex min-w-0 flex-wrap gap-2 text-sm">
        <legend className="sr-only">Estado del stock</legend>
        {chips.map((c) => {
          const active = (filters.status ?? '') === c.key
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={active}
              onClick={() => navigate({ estado: c.key })}
              className={`h-9 cursor-pointer rounded-full border px-3.5 ${
                active
                  ? 'border-accent bg-accent-soft font-medium text-accent'
                  : 'border-line bg-surface hover:bg-surface-2'
              }`}
            >
              {c.label} <span className={`font-mono ${active ? '' : c.tone}`}>{c.count}</span>
            </button>
          )
        })}
      </fieldset>

      <StockFilters
        // Inputs no controlados: remontar si la URL cambia (ej. botón "atrás") para no desincronizar
        key={qs}
        filters={filters}
        categories={categories}
        showInactiveFilter={canAdjust}
        onChange={navigate}
        onClear={() => startTransition(() => router.replace(pathname, { scroll: false }))}
      />

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <p className="text-muted text-sm">
          {rows.length === 0
            ? 'Sin resultados'
            : `${rows.length} ${rows.length === 1 ? 'producto' : 'productos'}`}
        </p>
        <div className="flex flex-wrap gap-2.5">
          {canAdjust ? (
            <button
              type="button"
              onClick={() => setBatching(true)}
              className="h-11 cursor-pointer rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm"
            >
              Ingreso en lote
            </button>
          ) : null}
          {rows.length > 0 ? (
            <a href={exportHref} download className={BTN}>
              Exportar CSV
            </a>
          ) : null}
        </div>
      </div>

      <div
        aria-busy={isPending}
        inert={isPending}
        className={`flex flex-col gap-2.5 transition-opacity ${isPending ? 'opacity-50' : ''}`}
      >
        {isPending ? (
          <p role="status" className="text-muted text-sm">
            Cargando…
          </p>
        ) : null}
        <StockList rows={rows} canAdjust={canAdjust} onAction={setTarget} />
      </div>

      {canAdjust ? (
        <>
          <StockActionDialog target={target} onClose={() => setTarget(null)} />
          <BatchIngresoDialog
            open={batching}
            onClose={() => setBatching(false)}
            products={adjustable}
          />
        </>
      ) : null}
    </>
  )
}
