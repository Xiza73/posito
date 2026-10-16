import Link from 'next/link'
import type { StockAlert } from '../data/dashboard'

const ROW =
  'flex flex-col gap-0.5 rounded-ctl border border-line px-3.5 py-2.5 text-sm hover:bg-surface-2'

function StockRow({
  alert,
  label,
  href,
  tone,
}: {
  alert: StockAlert
  label: string
  href: string
  tone: string
}) {
  if (alert.count === 0) return null
  const extra = alert.count - alert.names.length
  return (
    <li>
      <Link href={href} className={ROW}>
        <span className={`font-medium ${tone}`}>
          {alert.count} {label}
        </span>
        <span className="text-muted text-xs">
          {alert.names.join(', ')}
          {extra > 0 ? ` y ${extra} más` : ''}
        </span>
      </Link>
    </li>
  )
}

type Props = {
  stock: { low: StockAlert; out: StockAlert }
  /** null = el rol no valida ventas. */
  pendingCount: number | null
  voidedCount: number
  pendingHref: string
  voidedHref: string
}

/** Lo que pide atención: stock (de toda la bodega), ventas por validar y anuladas del período. */
export function Alerts({ stock, pendingCount, voidedCount, pendingHref, voidedHref }: Props) {
  const nothing =
    stock.low.count === 0 && stock.out.count === 0 && !pendingCount && voidedCount === 0
  return (
    <section className="rounded-card border border-line bg-surface p-4 md:p-5">
      <h3 className="font-semibold">Requiere atención</h3>
      {nothing ? (
        <p className="py-6 text-muted text-sm">Todo en orden: no hay alertas.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          <StockRow
            alert={stock.out}
            label={stock.out.count === 1 ? 'producto agotado' : 'productos agotados'}
            href="/inventario?estado=agotado"
            tone="text-bad"
          />
          <StockRow
            alert={stock.low}
            label={stock.low.count === 1 ? 'producto con stock bajo' : 'productos con stock bajo'}
            href="/inventario?estado=bajo"
            tone="text-warn"
          />
          {pendingCount ? (
            <li>
              <Link href={pendingHref} className={ROW}>
                <span className="font-medium text-warn">
                  {pendingCount} {pendingCount === 1 ? 'venta por validar' : 'ventas por validar'}
                </span>
              </Link>
            </li>
          ) : null}
          {voidedCount > 0 ? (
            <li>
              <Link href={voidedHref} className={ROW}>
                <span className="font-medium">
                  {voidedCount} {voidedCount === 1 ? 'venta anulada' : 'ventas anuladas'}
                </span>
                <span className="text-muted text-xs">En este período</span>
              </Link>
            </li>
          ) : null}
        </ul>
      )}
    </section>
  )
}
