import { formatCents } from '@/lib/format'
import { type Period, PREVIOUS_LABELS } from '../lib/period'

/** Variación contra el período previo: flecha + texto (no solo color). "—" si no hay base. */
function Delta({ change, vs }: { change: number | null; vs: string }) {
  if (change === null) {
    return (
      <p className="mt-1 text-muted text-xs">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Sin datos para comparar</span> {vs}
      </p>
    )
  }
  if (change === 0) {
    return <p className="mt-1 text-muted text-xs">Sin cambio {vs}</p>
  }
  const up = change > 0
  return (
    <p className={`mt-1 text-xs ${up ? 'text-ok' : 'text-bad'}`}>
      <span aria-hidden="true">{up ? '▲' : '▼'}</span>{' '}
      <span className="font-medium">
        {up ? '+' : '−'}
        {Math.abs(change)} %
      </span>{' '}
      <span className="text-muted">
        <span className="sr-only">{up ? 'más' : 'menos'}</span> {vs}
      </span>
    </p>
  )
}

function Tile({
  label,
  value,
  change,
  vs,
}: {
  label: string
  value: string
  change: number | null
  vs: string
}) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 md:p-5">
      <dt className="text-muted text-sm">{label}</dt>
      <dd className="mt-1.5 font-mono font-semibold text-2xl">{value}</dd>
      <dd>
        <Delta change={change} vs={vs} />
      </dd>
    </div>
  )
}

type Props = {
  period: Period
  totals: { totalCents: number; count: number; avgTicketCents: number }
  changes: { total: number | null; count: number | null; avgTicket: number | null }
}

/** Total vendido, N° de ventas y ticket promedio, cada uno contra el período equivalente previo. */
export function KpiTiles({ period, totals, changes }: Props) {
  const vs = PREVIOUS_LABELS[period]
  return (
    <dl aria-label="Indicadores del período" className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
      <Tile
        label="Total vendido"
        value={formatCents(totals.totalCents)}
        change={changes.total}
        vs={vs}
      />
      <Tile label="N.° de ventas" value={String(totals.count)} change={changes.count} vs={vs} />
      <Tile
        label="Ticket promedio"
        value={formatCents(totals.avgTicketCents)}
        change={changes.avgTicket}
        vs={vs}
      />
    </dl>
  )
}
