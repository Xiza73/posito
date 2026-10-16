import Link from 'next/link'
import { formatReceiptNumber } from '@/lib/receipt'
import { formatReceiptDate } from '@/lib/receipt-lines'
import type { MovementRow } from '../data/inventory'
import { MOVEMENT_LABELS, signed } from '../lib/labels'

type Props = {
  rows: MovementRow[]
  /** false en el detalle de un producto (todas las filas son del mismo). */
  showProduct?: boolean
  viewer: { userId: string; seesAllSales: boolean }
}

const TH = 'px-4 py-3 font-medium'

const quantityClass = (n: number) => (n > 0 ? 'text-ok' : 'text-bad')

/** El cajero solo puede abrir sus propias ventas: las demás se muestran sin enlace. */
function canOpenSale(r: MovementRow, viewer: Props['viewer']) {
  return r.saleId !== null && (viewer.seesAllSales || r.saleCashierId === viewer.userId)
}

/** Boleta enlazada (venta/anulación) y/o nota o motivo del movimiento. */
function Detail({ r, viewer }: { r: MovementRow; viewer: Props['viewer'] }) {
  const receipt =
    r.saleSeries !== null && r.saleNumber !== null
      ? formatReceiptNumber(r.saleSeries, r.saleNumber)
      : null
  return (
    <>
      {receipt ? (
        canOpenSale(r, viewer) ? (
          <Link
            href={`/ventas/${r.saleId}`}
            className="font-medium font-mono text-accent underline-offset-2 hover:underline"
          >
            {receipt}
          </Link>
        ) : (
          <span className="font-mono">{receipt}</span>
        )
      ) : null}
      {receipt && r.reason ? ' · ' : null}
      {r.reason ? <span>{r.reason}</span> : null}
      {!receipt && !r.reason ? <span className="text-muted">—</span> : null}
    </>
  )
}

/** Tabla en md+ y tarjetas en móvil. */
export function MovementsList({ rows, showProduct = true, viewer }: Props) {
  if (rows.length === 0) {
    return (
      <p className="rounded-card border border-line bg-surface p-8 text-center text-muted text-sm">
        No hay movimientos para mostrar.
      </p>
    )
  }

  return (
    <>
      <table className="hidden w-full overflow-hidden rounded-card border border-line bg-surface text-left text-sm md:table">
        <thead className="bg-surface-2 text-muted">
          <tr>
            <th scope="col" className={TH}>
              Fecha
            </th>
            {showProduct ? (
              <th scope="col" className={TH}>
                Producto
              </th>
            ) : null}
            <th scope="col" className={TH}>
              Tipo
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Cantidad
            </th>
            <th scope="col" className={TH}>
              Usuario
            </th>
            <th scope="col" className={TH}>
              Motivo o nota
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-line border-t align-top">
              <td className="whitespace-nowrap px-4 py-3 text-muted">
                {formatReceiptDate(r.createdAt)}
              </td>
              {showProduct ? (
                <td className="px-4 py-3 font-medium">
                  <Link
                    href={`/inventario/${r.productId}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {r.productName}
                  </Link>
                </td>
              ) : null}
              <td className="px-4 py-3">{MOVEMENT_LABELS[r.type]}</td>
              <td className={`px-4 py-3 text-right font-mono ${quantityClass(r.quantity)}`}>
                {signed(r.quantity)}
              </td>
              <td className="px-4 py-3">{r.userName ?? '—'}</td>
              <td className="px-4 py-3">
                <Detail r={r} viewer={viewer} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="flex flex-col gap-2.5 md:hidden">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="min-w-0 font-medium">
                {showProduct ? (
                  <Link href={`/inventario/${r.productId}`} className="hover:underline">
                    {r.productName}
                  </Link>
                ) : (
                  MOVEMENT_LABELS[r.type]
                )}
              </span>
              <span className={`flex-none font-mono text-sm ${quantityClass(r.quantity)}`}>
                {signed(r.quantity)}
              </span>
            </div>
            <div className="text-muted text-xs">
              {formatReceiptDate(r.createdAt)}
              {showProduct ? ` · ${MOVEMENT_LABELS[r.type]}` : ''}
              {r.userName ? ` · ${r.userName}` : ''}
            </div>
            {r.reason || r.saleId ? (
              <div className="text-sm">
                <Detail r={r} viewer={viewer} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  )
}
