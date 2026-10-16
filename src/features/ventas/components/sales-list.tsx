import Link from 'next/link'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatCents } from '@/lib/format'
import { PAYMENT_LABELS } from '@/lib/payment'
import { formatReceiptNumber } from '@/lib/receipt'
import { formatReceiptDate } from '@/lib/receipt-lines'
import type { SaleListRow } from '../data/sales'

const TH = 'px-4 py-3 font-medium'

const amountClass = (r: SaleListRow) => (r.status === 'anulada' ? 'text-muted line-through' : '')

/** Tabla en md+ y tarjetas en móvil. Cada fila lleva al detalle. */
export function SalesList({ rows, showCashier }: { rows: SaleListRow[]; showCashier: boolean }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-card border border-line bg-surface p-8 text-center text-muted text-sm">
        No hay ventas en este rango.
      </p>
    )
  }

  return (
    <>
      <table className="hidden w-full overflow-hidden rounded-card border border-line bg-surface text-left text-sm md:table">
        <thead className="bg-surface-2 text-muted">
          <tr>
            <th scope="col" className={TH}>
              Boleta
            </th>
            <th scope="col" className={TH}>
              Fecha
            </th>
            {showCashier ? (
              <th scope="col" className={TH}>
                Cajero/a
              </th>
            ) : null}
            <th scope="col" className={TH}>
              Pago
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Total
            </th>
            <th scope="col" className={TH}>
              Estado
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-line border-t hover:bg-surface-2">
              <td className="px-4 py-3">
                <Link
                  href={`/ventas/${r.id}`}
                  className="font-medium font-mono text-accent underline-offset-2 hover:underline"
                >
                  {formatReceiptNumber(r.series, r.number)}
                </Link>
                <div className="text-muted text-xs">
                  {r.itemCount} {r.itemCount === 1 ? 'unidad' : 'unidades'}
                </div>
              </td>
              <td className="px-4 py-3 text-muted">{formatReceiptDate(r.createdAt)}</td>
              {showCashier ? <td className="px-4 py-3">{r.cashierName ?? '—'}</td> : null}
              <td className="px-4 py-3">{PAYMENT_LABELS[r.paymentMethod]}</td>
              <td className={`px-4 py-3 text-right font-mono ${amountClass(r)}`}>
                {formatCents(r.totalCents)}
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="flex flex-col gap-2.5 md:hidden">
        {rows.map((r) => (
          <li key={r.id}>
            <Link
              href={`/ventas/${r.id}`}
              className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium font-mono">
                  {formatReceiptNumber(r.series, r.number)}
                </span>
                <span className={`font-mono text-sm ${amountClass(r)}`}>
                  {formatCents(r.totalCents)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-muted text-xs">
                <span>{formatReceiptDate(r.createdAt)}</span>
                <StatusBadge status={r.status} />
              </div>
              <div className="text-muted text-xs">
                {PAYMENT_LABELS[r.paymentMethod]}
                {showCashier && r.cashierName ? ` · ${r.cashierName}` : ''}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
