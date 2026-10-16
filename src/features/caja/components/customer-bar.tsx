import type { CustomerOption } from '@/lib/customer-input'
import { formatDocument } from '@/lib/document'

type Props = {
  customer: CustomerOption | null
  /** Ticket congelado (cobro sin confirmar): no se puede cambiar el cliente. */
  disabled: boolean
  onPick: () => void
  onClear: () => void
  className?: string
}

/** Cliente de la venta: "público general · cambiar" o el cliente elegido con "Quitar". */
export function CustomerBar({ customer, disabled, onPick, onClear, className = '' }: Props) {
  const doc =
    customer?.documentType && customer.documentNumber
      ? formatDocument(customer.documentType, customer.documentNumber)
      : null

  return (
    <div className={`flex items-stretch gap-2 ${className}`}>
      <button
        type="button"
        onClick={onPick}
        disabled={disabled}
        className="flex h-10.5 min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-ctl border border-line border-dashed px-3 text-left text-[13px] text-muted hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="size-2 flex-none rounded-full bg-accent" aria-hidden="true" />
        <span className="min-w-0 truncate">
          {customer ? (
            <>
              Cliente: <span className="font-medium text-ink">{customer.name}</span>
              {doc ? <span className="font-mono"> · {doc}</span> : null}
            </>
          ) : (
            'Cliente: público general · cambiar'
          )}
        </span>
      </button>
      {customer ? (
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          aria-label={`Quitar cliente ${customer.name}`}
          className="flex-none cursor-pointer rounded-ctl px-2.5 text-[13px] text-muted underline-offset-4 hover:text-ink hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          Quitar
        </button>
      ) : null}
    </div>
  )
}
