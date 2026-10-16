'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { CustomerListRow } from '../data/customers'
import { type CustomersFilters, customersQueryString } from '../lib/filters'
import { CustomerFilters } from './customer-filters'
import { CustomerFormDialog } from './customer-form-dialog'
import { CustomersList } from './customers-list'

type Props = {
  rows: CustomerListRow[]
  filters: CustomersFilters
  page: number
  hasNext: boolean
  perms: { create: boolean; delete: boolean; export: boolean }
}

const BTN =
  'inline-flex h-10 cursor-pointer items-center rounded-ctl border border-line px-4 font-medium text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50'

/** Orquesta filtros (en la URL), lista, paginación, alta y exportación. */
export function CustomersView({ rows, filters, page, hasNext, perms }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [creating, setCreating] = useState(false)
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

  const exportHref = `/clientes/export?${customersQueryString(filters)}`

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <CustomerFilters
          // Inputs no controlados: remontar si la URL cambia (ej. botón "atrás") para no desincronizar
          key={customersQueryString(filters)}
          {...filters}
          showInactiveFilter={perms.delete}
          onChange={navigate}
          onClear={() => startTransition(() => router.replace(pathname, { scroll: false }))}
        />
        {perms.create ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="h-11 cursor-pointer rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm"
          >
            Nuevo cliente
          </button>
        ) : null}
        {perms.export ? (
          <a href={exportHref} download className={`${BTN} h-11`}>
            Exportar CSV
          </a>
        ) : null}
      </div>

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

        <CustomersList rows={rows} />

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

      {perms.create ? (
        <CustomerFormDialog target={creating ? 'new' : null} onClose={() => setCreating(false)} />
      ) : null}
    </>
  )
}
