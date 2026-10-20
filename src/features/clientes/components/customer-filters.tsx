'use client'

import { useRef } from 'react'
import { ClearFiltersButton } from '@/components/ui/clear-filters-button'
import { Icon } from '@/components/ui/icon'

type Props = {
  query: string
  includeInactive: boolean
  /** Solo quien puede reactivar ve el filtro de inactivos. */
  showInactiveFilter: boolean
  /** Reescribe parámetros de la URL conservando los demás (lo aplica la vista, en una transición). */
  onChange: (changes: Record<string, string>) => void
  onClear: () => void
}

/**
 * Filtros en la URL (compartible). "Inactivos" aplica al instante; el texto, al enviar (Enter).
 */
export function CustomerFilters({
  query,
  includeInactive,
  showInactiveFilter,
  onChange,
  onClear,
}: Props) {
  const queryRef = useRef<HTMLInputElement>(null)

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onChange({ q: queryRef.current?.value.trim() ?? '' })
      }}
      className="flex w-full min-w-0 flex-wrap items-center gap-2.5 sm:w-auto sm:min-w-80 sm:flex-1"
    >
      <label className="field-box flex h-11 min-w-0 flex-1 basis-full items-center gap-2.5 rounded-ctl border border-line bg-surface px-3.5 sm:min-w-48 sm:basis-0">
        <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5" />
        <span className="sr-only">Buscar por nombre, DNI o RUC</span>
        <input
          ref={queryRef}
          type="search"
          name="q"
          defaultValue={query}
          maxLength={80}
          placeholder="Buscar por nombre, DNI o RUC"
          className="w-0 min-w-0 flex-1 bg-transparent text-sm"
        />
      </label>
      {showInactiveFilter ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="inactivos"
            defaultChecked={includeInactive}
            onChange={(e) =>
              onChange({
                q: queryRef.current?.value.trim() ?? '',
                inactivos: e.currentTarget.checked ? '1' : '',
              })
            }
            className="size-4 accent-[var(--accent)]"
          />
          Mostrar inactivos
        </label>
      ) : null}
      <ClearFiltersButton onClear={onClear} />
      <button type="submit" className="sr-only">
        Buscar
      </button>
    </form>
  )
}
