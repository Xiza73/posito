import { formatCents } from '@/lib/format'
import type { UnitPrice } from '@/lib/pricing'
import { type CatalogProduct, canAddMore } from '../lib/catalog'
import { lineTotalCents } from '../lib/totals'
import { LineTotalEditor } from './line-total-editor'

export type CartLineView = {
  item: CatalogProduct
  qty: number
  /** Precio efectivo (con nivel por mayor); solo para mostrar. */
  price: UnitPrice
  /** Total editado a mano (solo si la bodega lo permite); null = precio automático. */
  manualTotalCents: number | null
  /** Se quitó un precio editado porque cambió la cantidad (aviso sutil). */
  manualWasReset: boolean
}

type Props = {
  lines: CartLineView[]
  onChangeQty: (id: string, delta: 1 | -1) => void
  /** La bodega permite editar el total de cada línea. */
  allowManualPrice: boolean
  /** null = volver al precio automático. */
  onSetManual: (id: string, cents: number | null) => void
  /** Ticket congelado (cobro sin confirmar): no se puede editar nada. */
  locked: boolean
  /** Botones de cantidad más grandes (hoja móvil). */
  large?: boolean
}

export function TicketLines({
  lines,
  onChangeQty,
  allowManualPrice,
  onSetManual,
  locked,
  large = false,
}: Props) {
  const btn = `${large ? 'size-8.5' : 'size-7.5'} cursor-pointer rounded-full text-base hover:bg-line disabled:cursor-not-allowed disabled:opacity-40`

  return (
    <ul>
      {lines.map(({ item, qty, price, manualTotalCents, manualWasReset }) => {
        const atMax = !canAddMore(item, qty)
        const autoTotal = lineTotalCents({ unitPriceCents: price.unitPriceCents, qty })
        return (
          <li
            key={item.id}
            className="flex flex-wrap items-center gap-2.5 border-line border-b py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-sm">{item.name}</div>
              <div className="text-muted text-xs">
                {manualTotalCents !== null ? (
                  <>
                    <span className="font-medium text-accent">Precio editado</span>{' '}
                    <s>{formatCents(autoTotal)}</s>{' '}
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => onSetManual(item.id, null)}
                      className="cursor-pointer underline hover:text-ink disabled:cursor-not-allowed"
                      aria-label={`Restablecer el precio automático de ${item.name}`}
                    >
                      Restablecer
                    </button>
                  </>
                ) : price.source === 'mayor' ? (
                  <>
                    <s className="mr-1">{formatCents(item.priceCents)}</s>
                    {formatCents(price.unitPriceCents)} (por mayor)
                  </>
                ) : (
                  formatCents(price.unitPriceCents)
                )}
              </div>
              {manualWasReset ? (
                <div role="status" className="text-muted text-xs italic">
                  Se restableció el precio al cambiar la cantidad
                </div>
              ) : null}
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
            {allowManualPrice ? (
              <LineTotalEditor
                name={item.name}
                autoCents={autoTotal}
                manualCents={manualTotalCents}
                large={large}
                disabled={locked}
                onChange={(cents) => onSetManual(item.id, cents)}
              />
            ) : (
              <span className="min-w-16 text-right font-mono text-sm">
                {formatCents(autoTotal)}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
