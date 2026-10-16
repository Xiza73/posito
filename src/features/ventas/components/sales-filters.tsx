'use client'

import { ClearFiltersButton } from '@/components/ui/clear-filters-button'
import { Icon } from '@/components/ui/icon'
import { PAYMENT_LABELS, PAYMENT_METHODS } from '@/lib/payment'
import { type SalesFilters as Filters, quickRanges } from '../lib/filters'

type Props = {
  filters: Filters
  /** Hoy en Lima (YYYY-MM-DD), calculado en el servidor. */
  today: string
  products: { id: string; name: string; active: boolean }[]
  /** null = no se muestra el filtro (el cajero solo ve lo suyo). */
  cashiers: { id: string; name: string }[] | null
  /** Aplica cambios a la URL (la vista los envuelve en una transición). */
  onChange: (changes: Record<string, string>) => void
  /** Vuelve a la vista por defecto (hoy, sin filtros). */
  onClear: () => void
}

const SELECT = 'h-11 min-w-0 rounded-ctl border border-line bg-surface pl-3 text-sm'
const DATE = 'h-11 rounded-ctl border border-line bg-surface px-3 text-sm'

/**
 * Filtros en la URL (compartible). Fechas, método, estado, cajero y producto aplican al instante;
 * la boleta, al enviar (Enter).
 */
export function SalesFilters({ filters, today, products, cashiers, onChange, onClear }: Props) {
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

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const data = new FormData(e.currentTarget)
          onChange({ boleta: String(data.get('boleta') ?? '').trim() })
        }}
        className="flex flex-wrap items-center gap-2.5"
      >
        <label className="field-box flex h-11 min-w-44 flex-1 items-center gap-2.5 rounded-ctl border border-line bg-surface px-3.5">
          <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5" />
          <span className="sr-only">Buscar por número de boleta</span>
          <input
            type="search"
            name="boleta"
            defaultValue={filters.receipt ?? ''}
            maxLength={20}
            placeholder="Boleta, ej. B001-00038"
            className="w-0 min-w-0 flex-1 bg-transparent text-sm"
          />
        </label>

        <select
          aria-label="Método de pago"
          defaultValue={filters.paymentMethod ?? ''}
          onChange={(e) => onChange({ metodo: e.currentTarget.value })}
          className={SELECT}
        >
          <option value="">Todos los pagos</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_LABELS[m]}
            </option>
          ))}
        </select>

        <select
          aria-label="Estado"
          defaultValue={filters.status ?? ''}
          onChange={(e) => onChange({ estado: e.currentTarget.value })}
          className={SELECT}
        >
          <option value="">Todos los estados</option>
          <option value="completada">Completadas</option>
          <option value="anulada">Anuladas</option>
          <option value="pendiente">Por validar</option>
        </select>

        {cashiers ? (
          <select
            aria-label="Cajero/a"
            defaultValue={filters.cashierId ?? ''}
            onChange={(e) => onChange({ cajero: e.currentTarget.value })}
            className={SELECT}
          >
            <option value="">Todo el personal</option>
            {cashiers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
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

        <button type="submit" className="sr-only">
          Buscar
        </button>
      </form>
    </div>
  )
}
