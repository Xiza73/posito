'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { type TransitionStartFunction, useRef } from 'react'
import { ClearFiltersButton } from '@/components/ui/clear-filters-button'
import { Icon } from '@/components/ui/icon'

type Props = {
  query: string
  categoryId: string
  includeInactive: boolean
  categories: { id: string; name: string }[]
  /** Solo quien puede reactivar ve el filtro de inactivos. */
  showInactiveFilter: boolean
  /** Transición del padre: así la lista sabe que hay una carga en curso. */
  startTransition: TransitionStartFunction
}

/**
 * Filtros en la URL (compartible), aplicados con navegación de cliente: sin recarga de página.
 * Categoría e inactivos aplican al instante; el texto, al enviar (Enter o botón de buscar).
 */
export function ProductFilters({
  query,
  categoryId,
  includeInactive,
  categories,
  showInactiveFilter,
  startTransition,
}: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryRef = useRef<HTMLInputElement>(null)

  /** Reescribe un solo parámetro conservando los demás; el texto toma lo que se ve en pantalla. */
  function apply(changes: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('q', queryRef.current?.value.trim() ?? '')
    for (const [key, value] of Object.entries(changes)) params.set(key, value)
    for (const [key, value] of [...params]) if (value === '') params.delete(key)
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        apply({})
      }}
      className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5"
    >
      <label className="field-box flex h-11 min-w-48 flex-1 items-center gap-2.5 rounded-ctl border border-line bg-surface px-3.5">
        <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5" />
        <span className="sr-only">Buscar por nombre o código de barras</span>
        <input
          ref={queryRef}
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Buscar por nombre o código"
          className="w-0 min-w-0 flex-1 bg-transparent text-sm"
        />
      </label>
      <select
        name="categoria"
        aria-label="Categoría"
        defaultValue={categoryId}
        onChange={(e) => apply({ categoria: e.currentTarget.value })}
        className="h-11 rounded-ctl border border-line bg-surface pl-3 text-sm"
      >
        <option value="">Todas las categorías</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {showInactiveFilter ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="inactivos"
            defaultChecked={includeInactive}
            onChange={(e) => apply({ inactivos: e.currentTarget.checked ? '1' : '' })}
            className="size-4 accent-[var(--accent)]"
          />
          Mostrar inactivos
        </label>
      ) : null}
      <ClearFiltersButton
        onClear={() => startTransition(() => router.replace(pathname, { scroll: false }))}
      />
      <button type="submit" className="sr-only">
        Buscar
      </button>
    </form>
  )
}
