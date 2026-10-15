import { formatCents } from '@/lib/format'
import { PAYMENT_LABELS, PAYMENT_METHODS } from '@/lib/payment'
import type { SalesSummary } from '../data/sales'

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface px-4 py-3">
      <dt className="text-muted text-xs">{label}</dt>
      <dd className="mt-0.5 font-mono font-semibold text-lg">{value}</dd>
      {note ? <dd className="text-muted text-xs">{note}</dd> : null}
    </div>
  )
}

/** Totales del rango filtrado. Las anuladas no suman: se cuentan aparte. */
export function SalesTotals({ summary }: { summary: SalesSummary }) {
  const { count, totalCents, byMethod, voidedCount } = summary
  return (
    <dl aria-label="Totales del rango" className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
      <Stat
        label="Ventas"
        value={String(count)}
        note={
          voidedCount > 0
            ? `${voidedCount} ${voidedCount === 1 ? 'anulada' : 'anuladas'}`
            : undefined
        }
      />
      <Stat label="Total cobrado" value={formatCents(totalCents)} />
      {PAYMENT_METHODS.map((m) => (
        <Stat key={m} label={PAYMENT_LABELS[m]} value={formatCents(byMethod[m])} />
      ))}
    </dl>
  )
}
