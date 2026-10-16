'use client'

import { ClearFiltersButton } from '@/components/ui/clear-filters-button'
import { type MovementFilters as Filters, quickRanges } from '../lib/filters'
import { MOVEMENT_LABELS, MOVEMENT_TYPES } from '../lib/labels'

type Props = {
  filters: Filters
  /** Hoy en Lima (YYYY-MM-DD), calculado en el servidor. */
  today: string
  products: { id: string; name: string; active: boolean }[]
  /** null = no se muestra el filtro (solo el administrador filtra por usuario). */
  users: { id: string; name: string }[] | null
  /** Aplica cambios a la URL (la vista los envuelve en una transición). */
  onChange: (changes: Record<string, string>) => void
  /** Vuelve a la vista por defecto (últimos 7 días, sin filtros). */
  onClear: () => void
}

const SELECT = 'h-11 min-w-0 rounded-ctl border border-line bg-surface pl-3 text-sm'
const DATE = 'h-11 rounded-ctl border border-line bg-surface px-3 text-sm'

/** Filtros en la URL (compartible): fechas, tipo, usuario y producto aplican al instante. */
export function MovementsFilters({ filters, today, products, users, onChange, onClear }: Props) {
  // Mientras se teclea el año, el navegador emite fechas intermedias (0002, 0020…): se ignoran.
  const onDate = (key: 'desde' | 'hasta') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value
    if (v === '' || Number(v.slice(0, 4)) >= 2000) onChange({ [key]: v })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-end gap-2.5">
        <fieldset className="flex min-w-0 gap-0.5 rounded-full border border-line bg-surface p-0.5 text-sm">
          <legend className="sr-only">Rango rápido</legend>
          {quickRanges(today).map((r) => {
            const active = filters.from === r.from && filters.to === r.to
            return (
              <button
                key={r.key}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ desde: r.from, hasta: r.to })}
                className={`h-9 cursor-pointer rounded-full px-3.5 ${
                  active ? 'bg-accent font-medium text-accent-ink' : 'text-ink hover:bg-surface-2'
                }`}
              >
                {r.label}
              </button>
            )
          })}
        </fieldset>

        <label className="flex flex-col gap-1 text-muted text-xs">
          Desde
          <input
            type="date"
            name="desde"
            max={today}
            defaultValue={filters.from}
            onChange={onDate('desde')}
            className={DATE}
          />
        </label>
        <label className="flex flex-col gap-1 text-muted text-xs">
          Hasta
          <input
            type="date"
            name="hasta"
            max={today}
            defaultValue={filters.to}
            onChange={onDate('hasta')}
            className={DATE}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <select
          aria-label="Tipo de movimiento"
          defaultValue={filters.type ?? ''}
          onChange={(e) => onChange({ tipo: e.currentTarget.value })}
          className={SELECT}
        >
          <option value="">Todos los tipos</option>
          {MOVEMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {MOVEMENT_LABELS[t]}
            </option>
          ))}
        </select>

        {users ? (
          <select
            aria-label="Usuario"
            defaultValue={filters.userId ?? ''}
            onChange={(e) => onChange({ usuario: e.currentTarget.value })}
            className={SELECT}
          >
            <option value="">Todo el personal</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        ) : null}

        <select
          aria-label="Producto"
          defaultValue={filters.productId ?? ''}
          onChange={(e) => onChange({ producto: e.currentTarget.value })}
          className={`${SELECT} max-w-56`}
        >
          <option value="">Todos los productos</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.active ? '' : ' (inactivo)'}
            </option>
          ))}
        </select>

        <ClearFiltersButton onClear={onClear} />
      </div>
    </div>
  )
}
