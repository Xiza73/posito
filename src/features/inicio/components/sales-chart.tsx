import { formatCents } from '@/lib/format'
import type { Bucket } from '../lib/metrics'

type Props = {
  kind: 'hour' | 'day'
  items: Bucket[]
  /** Sin ventas completadas en el período: se muestra el estado vacío en vez de barras. */
  empty: boolean
}

const noun = (n: number) => (n === 1 ? 'venta' : 'ventas')

/**
 * Barras en CSS puro. Las barras son decorativas (aria-hidden, con `title` de tooltip); la versión
 * accesible es la tabla oculta visualmente con los mismos valores.
 */
export function SalesChart({ kind, items, empty }: Props) {
  const max = Math.max(...items.map((b) => b.cents), 0)
  const title = kind === 'hour' ? 'Ventas por hora' : 'Ventas por día'
  const unit = kind === 'hour' ? 'Hora' : 'Día'
  // Con 24 barras solo se rotula una de cada tres para que quepan en el móvil
  const showLabel = (i: number) => kind === 'day' || i % 3 === 0

  return (
    <section className="rounded-card border border-line bg-surface p-4 md:p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-muted text-xs">Hora de Lima · solo ventas completadas</p>

      {empty ? (
        <p className="py-10 text-center text-muted text-sm">Aún no hay ventas en este período.</p>
      ) : (
        <>
          <div
            aria-hidden="true"
            className={`mt-4 flex h-40 items-end ${kind === 'hour' ? 'gap-0.5 md:gap-1' : 'gap-2 md:gap-3'}`}
          >
            {items.map((b, i) => (
              <div
                key={b.key}
                title={`${b.label}: ${formatCents(b.cents)} · ${b.count} ${noun(b.count)}`}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
              >
                <div
                  className={`w-full rounded-t-[4px] ${b.cents > 0 ? 'bg-accent' : 'bg-surface-2'}`}
                  style={{ height: b.cents > 0 ? `${Math.max((b.cents / max) * 100, 3)}%` : '2px' }}
                />
                <span className="h-4 w-full overflow-visible whitespace-nowrap text-center text-[10px] text-muted md:text-xs">
                  {showLabel(i) ? b.label : ''}
                </span>
              </div>
            ))}
          </div>

          <table className="sr-only">
            <caption>{title}</caption>
            <thead>
              <tr>
                <th scope="col">{unit}</th>
                <th scope="col">Total</th>
                <th scope="col">Ventas</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <tr key={b.key}>
                  <th scope="row">{b.label}</th>
                  <td>{formatCents(b.cents)}</td>
                  <td>{b.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
