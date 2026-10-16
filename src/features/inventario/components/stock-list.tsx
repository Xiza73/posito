import Link from 'next/link'
import { StockBadge } from '@/components/ui/stock-badge'
import type { StockRow } from '../data/inventory'
import type { StockTarget } from './stock-action-dialog'

type Props = {
  rows: StockRow[]
  /** Quien puede ingresar, ajustar y contar (stock:adjust). */
  canAdjust: boolean
  onAction: (target: StockTarget) => void
}

const TH = 'px-4 py-3 font-medium'
const ACTION =
  'h-9 cursor-pointer rounded-ctl border border-line px-3 font-medium text-sm hover:bg-surface-2'

function InactiveTag() {
  return (
    <span className="ml-2 rounded-full border border-line px-2 py-0.5 font-normal text-muted text-xs">
      Inactivo
    </span>
  )
}

/** Un producto inactivo o que no controla stock no admite movimientos (el servidor también lo rechaza). */
const adjustable = (r: StockRow) => r.active && r.tracksStock

function StockCell(r: StockRow) {
  return r.tracksStock ? (
    <StockBadge {...r} />
  ) : (
    <span className="text-muted text-xs">No controla stock</span>
  )
}

function Actions({ r, canAdjust, onAction }: { r: StockRow } & Omit<Props, 'rows'>) {
  return (
    <div className="flex flex-wrap items-start justify-end gap-2">
      {canAdjust && adjustable(r) ? (
        <>
          <button
            type="button"
            onClick={() => onAction({ kind: 'ingreso', product: r })}
            aria-label={`Ingresar mercadería de ${r.name}`}
            className={ACTION}
          >
            Ingresar
          </button>
          <button
            type="button"
            onClick={() => onAction({ kind: 'ajuste', product: r })}
            aria-label={`Ajustar stock de ${r.name}`}
            className={ACTION}
          >
            Ajustar
          </button>
          <button
            type="button"
            onClick={() => onAction({ kind: 'conteo', product: r })}
            aria-label={`Contar stock de ${r.name}`}
            className={ACTION}
          >
            Contar
          </button>
        </>
      ) : null}
      <Link
        href={`/inventario/${r.id}`}
        aria-label={`Ver movimientos de ${r.name}`}
        className={`${ACTION} inline-flex items-center`}
      >
        Movimientos
      </Link>
    </div>
  )
}

/** Tabla en md+ y tarjetas en móvil. */
export function StockList({ rows, ...actions }: Props) {
  if (rows.length === 0) {
    return (
      <p className="rounded-card border border-line bg-surface p-8 text-center text-muted text-sm">
        No hay productos para mostrar.
      </p>
    )
  }

  return (
    <>
      <table className="hidden w-full overflow-hidden rounded-card border border-line bg-surface text-left text-sm md:table">
        <thead className="bg-surface-2 text-muted">
          <tr>
            <th scope="col" className={TH}>
              Producto
            </th>
            <th scope="col" className={TH}>
              Categoría
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Stock
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Mínimo
            </th>
            <th scope="col" className={`${TH} text-right`}>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`border-line border-t ${r.active ? '' : 'opacity-60'}`}>
              <td className="px-4 py-3">
                <div className="font-medium">
                  {r.name}
                  {r.active ? null : <InactiveTag />}
                </div>
                {r.barcode ? <div className="font-mono text-muted text-xs">{r.barcode}</div> : null}
              </td>
              <td className="px-4 py-3 text-muted">{r.categoryName ?? '—'}</td>
              <td className="px-4 py-3 text-right">
                <StockCell {...r} />
              </td>
              <td className="px-4 py-3 text-right font-mono text-muted">
                {r.tracksStock ? r.minStock : '—'}
              </td>
              <td className="px-4 py-3">
                <Actions r={r} {...actions} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="flex flex-col gap-2.5 md:hidden">
        {rows.map((r) => (
          <li
            key={r.id}
            className={`flex flex-col gap-3 rounded-card border border-line bg-surface p-4 ${
              r.active ? '' : 'opacity-60'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">
                  {r.name}
                  {r.active ? null : <InactiveTag />}
                </div>
                <div className="text-muted text-xs">
                  {r.categoryName ?? 'Sin categoría'}
                  {r.barcode ? <span className="font-mono"> · {r.barcode}</span> : null}
                </div>
              </div>
              <div className="flex flex-none flex-col items-end gap-0.5">
                <StockCell {...r} />
                {r.tracksStock ? (
                  <span className="text-muted text-xs">Mínimo {r.minStock}</span>
                ) : null}
              </div>
            </div>
            <Actions r={r} {...actions} />
          </li>
        ))}
      </ul>
    </>
  )
}
