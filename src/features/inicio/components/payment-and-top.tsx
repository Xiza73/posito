import { formatCents } from '@/lib/format'
import { PAYMENT_LABELS, PAYMENT_METHODS, type PaymentMethod } from '@/lib/payment'
import { sharePercent } from '../lib/metrics'

const CARD = 'rounded-card border border-line bg-surface p-4 md:p-5'

export function PaymentBreakdown({
  byMethod,
  totalCents,
}: {
  byMethod: Record<PaymentMethod, number>
  totalCents: number
}) {
  return (
    <section className={CARD}>
      <h3 className="font-semibold">Por método de pago</h3>
      {totalCents === 0 ? (
        <p className="py-6 text-muted text-sm">Aún no hay cobros en este período.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {PAYMENT_METHODS.map((m) => {
            const pct = sharePercent(byMethod[m], totalCents)
            return (
              <li key={m}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span>{PAYMENT_LABELS[m]}</span>
                  <span className="font-mono">
                    {formatCents(byMethod[m])} <span className="text-muted text-xs">· {pct} %</span>
                  </span>
                </div>
                <div
                  aria-hidden="true"
                  className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2"
                >
                  <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function TopProducts({
  products,
}: {
  products: { productId: string; name: string; units: number; cents: number }[]
}) {
  return (
    <section className={CARD}>
      <h3 className="font-semibold">Más vendidos</h3>
      {products.length === 0 ? (
        <p className="py-6 text-muted text-sm">Aún no hay productos vendidos en este período.</p>
      ) : (
        <ol className="mt-3 flex flex-col">
          {products.map((p, i) => (
            <li
              key={p.productId}
              className="flex items-center gap-3 border-line border-t py-2.5 text-sm first:border-t-0"
            >
              <span className="w-4 font-mono text-muted text-xs">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="font-mono text-muted text-xs">
                {p.units} {p.units === 1 ? 'unidad' : 'unidades'}
              </span>
              <span className="min-w-20 text-right font-mono">{formatCents(p.cents)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
