import { ProductThumb } from '@/components/product-thumb'
import { formatCents } from '@/lib/format'
import { type CatalogProduct, isSoldOut, stockLabel } from '../lib/catalog'

function stockTone(item: CatalogProduct) {
  if (!item.tracksStock) return 'text-muted'
  if (item.stock === 0) return 'text-bad'
  if (item.stock < 10) return 'text-warn'
  return 'text-muted'
}

type Props = {
  item: CatalogProduct
  imageBase: string | null
  onAdd: (id: string) => void
}

export function ProductCard({ item, imageBase, onAdd }: Props) {
  const soldOut = isSoldOut(item)
  const label = stockLabel(item)

  return (
    <button
      type="button"
      disabled={soldOut}
      onClick={() => onAdd(item.id)}
      aria-label={`Agregar ${item.name}, ${formatCents(item.priceCents)}, ${label}`}
      className="flex min-h-30 cursor-pointer flex-col gap-2.5 rounded-card border border-line bg-surface p-3.5 text-left hover:border-accent disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-line"
    >
      <ProductThumb
        imageBase={imageBase}
        imagePath={item.imagePath}
        name={item.name}
        width={240}
        height={160}
        className="aspect-[3/2] w-full rounded-ctl"
      />
      <div className="flex-1">
        <div className="font-medium text-sm leading-snug">{item.name}</div>
        {item.category ? <div className="mt-0.5 text-muted text-xs">{item.category}</div> : null}
      </div>
      <div className="flex w-full items-center justify-between">
        <span className="font-mono text-sm">{formatCents(item.priceCents)}</span>
        <span className={`text-[11px] ${stockTone(item)}`}>{label}</span>
      </div>
    </button>
  )
}
