import { formatCents } from '@/lib/format'
import type { UnitPrice } from '@/lib/pricing'
import { type CatalogProduct, canAddMore } from '../lib/catalog'
import { lineTotalCents } from '../lib/totals'

export type CartLineView = {
  item: CatalogProduct
  qty: number
  /** Precio efectivo (con nivel por mayor); solo para mostrar. */
  price: UnitPrice
}

type Props = {
  lines: CartLineView[]
  onChangeQty: (id: string, delta: 1 | -1) => void
  /** Botones de cantidad más grandes (hoja móvil). */
  large?: boolean
}

export function TicketLines({ lines, onChangeQty, large = false }: Props) {
  const btn = `${large ? 'size-8.5' : 'size-7.5'} cursor-pointer rounded-full text-base hover:bg-line disabled:cursor-not-allowed disabled:opacity-40`

  return (
    <ul>
      {lines.map(({ item, qty, price }) => {
        const atMax = !canAddMore(item, qty)
        return (
          <li key={item.id} className="flex items-center gap-2.5 border-line border-b py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-sm">{item.name}</div>
              <div className="text-muted text-xs">
                {price.source === 'mayor' ? (
                  <>
                    <s className="mr-1">{formatCents(item.priceCents)}</s>
                    {formatCents(price.unitPriceCents)} (por mayor)
                  </>
                ) : (
                  formatCents(price.unitPriceCents)
                )}
              </div>
            </div>
            <div className="flex items-center gap-0.5 rounded-full bg-surface-2">
              <button
                type="button"
                className={btn}
                aria-label={`Quitar una unidad de ${item.name}`}
                onClick={() => onChangeQty(item.id, -1)}
              >
                −
              </button>
              <span className="min-w-4.5 text-center font-mono text-[13px]" aria-live="polite">
                {qty}
              </span>
              <button
                type="button"
                className={btn}
                disabled={atMax}
                aria-label={`Agregar una unidad de ${item.name}`}
                onClick={() => onChangeQty(item.id, 1)}
              >
                +
              </button>
            </div>
            <span className="min-w-16 text-right font-mono text-sm">
              {formatCents(lineTotalCents({ unitPriceCents: price.unitPriceCents, qty }))}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
