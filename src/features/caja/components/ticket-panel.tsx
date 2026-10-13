import { formatCents } from '@/lib/format'
import type { Totals } from '../lib/totals'
import { type PaymentMethod, PaymentMethods } from './payment-methods'
import { type CartLineView, TicketLines } from './ticket-lines'

type Props = {
  lines: CartLineView[]
  totals: Totals
  pay: PaymentMethod
  notice: string | null
  onPay: (method: PaymentMethod) => void
  onChangeQty: (key: string, delta: 1 | -1) => void
  onClear: () => void
  onCharge: () => void
}

/** Panel lateral de escritorio y tablet (>= 768). En móvil se usa la hoja deslizable. */
export function TicketPanel({
  lines,
  totals,
  pay,
  notice,
  onPay,
  onChangeQty,
  onClear,
  onCharge,
}: Props) {
  const empty = lines.length === 0

  return (
    <aside
      aria-label="Ticket actual"
      className="hidden w-75 flex-none flex-col overflow-auto border-line border-l bg-surface md:flex lg:w-[clamp(280px,28vw,360px)]"
    >
      <div className="flex flex-none items-center justify-between px-5 pt-5 pb-3">
        <h2 className="font-semibold">Ticket actual</h2>
        <span className="font-mono text-muted text-xs">B001-00038</span>
      </div>
      <button
        type="button"
        className="mx-5 mb-3 flex h-10.5 flex-none cursor-pointer items-center gap-2.5 rounded-ctl border border-line border-dashed px-3 text-left text-[13px] text-muted hover:border-accent"
      >
        <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
        Cliente: público general · añadir
      </button>

      <div className="flex min-h-37.5 flex-1 flex-col overflow-auto px-5">
        {empty ? (
          <p
            role="status"
            className="grid flex-1 place-items-center p-7 text-center text-muted text-sm"
          >
            {notice ?? 'Toca un producto o escanea un código para empezar'}
          </p>
        ) : (
          <TicketLines lines={lines} onChangeQty={onChangeQty} />
        )}
      </div>

      <div className="flex flex-none flex-col gap-3 border-line border-t px-5 pt-4 pb-5">
        <div className="flex justify-between text-[13px] text-muted">
          <span>Subtotal</span>
          <span className="font-mono">{formatCents(totals.subtotal)}</span>
        </div>
        <div className="flex justify-between text-[13px] text-muted">
          <span>IGV 18 % (incluido)</span>
          <span className="font-mono">{formatCents(totals.igv)}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="font-semibold">Total</span>
          <span className="font-mono text-2xl">{formatCents(totals.total)}</span>
        </div>
        <PaymentMethods value={pay} onChange={onPay} />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClear}
            disabled={empty}
            className="h-12.5 cursor-pointer rounded-ctl border border-line px-4 text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Vaciar
          </button>
          <button
            type="button"
            onClick={onCharge}
            disabled={empty}
            className="h-12.5 flex-1 cursor-pointer rounded-ctl bg-accent font-semibold text-[15px] text-accent-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cobrar {formatCents(totals.total)}
          </button>
        </div>
      </div>
    </aside>
  )
}
