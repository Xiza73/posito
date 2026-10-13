import { formatCents } from '@/lib/format'
import { type CatalogItem, MADE_TO_ORDER_STOCK } from '../data/products.mock'

function stockLabel(stock: number) {
  if (stock === 0) return 'Agotado'
  if (stock >= MADE_TO_ORDER_STOCK) return 'Preparado'
  return `${stock} u.`
}

function stockTone(stock: number) {
  if (stock === 0) return 'text-bad'
  if (stock < 10) return 'text-warn'
  return 'text-muted'
}

type Props = {
  item: CatalogItem
  onAdd: (key: string) => void
}

export function ProductCard({ item, onAdd }: Props) {
  const soldOut = item.stock === 0

  return (
    <button
      type="button"
      disabled={soldOut}
      onClick={() => onAdd(item.key)}
      aria-label={`Agregar ${item.label}, ${formatCents(item.priceCents)}, ${stockLabel(item.stock)}`}
      className="flex min-h-30 cursor-pointer flex-col gap-2.5 rounded-card border border-line bg-surface p-3.5 text-left hover:border-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-line"
    >
      <div
        aria-hidden="true"
        className="aspect-[3/2] w-full rounded-ctl border border-line bg-[repeating-linear-gradient(135deg,var(--surface2)_0_6px,transparent_6px_12px)]"
      />
      <div className="flex-1">
        <div className="font-medium text-sm leading-snug">{item.label}</div>
        <div className="mt-0.5 text-muted text-xs">{item.sub}</div>
      </div>
      <div className="flex w-full items-center justify-between">
        <span className="font-mono text-sm">{formatCents(item.priceCents)}</span>
        <span className={`text-[11px] ${stockTone(item.stock)}`}>{stockLabel(item.stock)}</span>
      </div>
    </button>
  )
}
