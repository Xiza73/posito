'use client'

import { ClearFiltersButton } from '@/components/ui/clear-filters-button'
import { Icon } from '@/components/ui/icon'
import type { StockFilters as Filters } from '../lib/filters'

type Props = {
  filters: Filters
  categories: { id: string; name: string }[]
  /** Solo quien puede gestionar el stock ve el filtro de inactivos. */
  showInactiveFilter: boolean
  /** Aplica cambios a la URL (la vista los envuelve en una transición). */
  onChange: (changes: Record<string, string>) => void
  onClear: () => void
}

/**
 * Filtros en la URL (compartible). Categoría e inactivos aplican al instante; el texto, al enviar
 * (Enter). El estado (stock bajo / agotados) se elige con los chips de arriba.
 */
export function StockFilters({
  filters,
  categories,
  showInactiveFilter,
  onChange,
  onClear,
}: Props) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const data = new FormData(e.currentTarget)
        onChange({ q: String(data.get('q') ?? '').trim() })
      }}
      className="flex flex-wrap items-center gap-2.5"
    >
      <label className="field-box flex h-11 min-w-48 flex-1 items-center gap-2.5 rounded-ctl border border-line bg-surface px-3.5">
        <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5" />
        <span className="sr-only">Buscar por nombre o código de barras</span>
        <input
          type="search"
          name="q"
          defaultValue={filters.query}
          maxLength={80}
          placeholder="Buscar por nombre o código"
          className="w-0 min-w-0 flex-1 bg-transparent text-sm"
        />
      </label>

      <select
        aria-label="Categoría"
        defaultValue={filters.categoryId ?? ''}
        onChange={(e) => onChange({ categoria: e.currentTarget.value })}
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
            defaultChecked={filters.includeInactive}
            onChange={(e) => onChange({ inactivos: e.currentTarget.checked ? '1' : '' })}
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
