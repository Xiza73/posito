import { stockStatus } from '../lib/stock-status'

type Props = { tracksStock: boolean; stock: number; minStock: number }

/** Estado del stock con texto (no solo color): Preparado, Agotado, Stock bajo o "N u.". */
export function StockBadge(p: Props) {
  switch (stockStatus(p)) {
    case 'untracked':
      return <span className="text-muted text-xs">Preparado</span>
    case 'out':
      return <span className="font-medium text-bad text-xs">Agotado</span>
    case 'low':
      return (
        <span className="font-medium text-warn text-xs">
          Stock bajo · <span className="font-mono">{p.stock} u.</span>
        </span>
      )
    default:
      return <span className="font-mono text-sm">{p.stock} u.</span>
  }
}
