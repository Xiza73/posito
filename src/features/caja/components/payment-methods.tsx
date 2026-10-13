export const PAYMENT_METHODS = ['Efectivo', 'Yape / Plin', 'Tarjeta'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

type Props = {
  value: PaymentMethod
  onChange: (method: PaymentMethod) => void
}

export function PaymentMethods({ value, onChange }: Props) {
  return (
    <fieldset
      aria-label="Método de pago"
      className="flex min-w-0 gap-0.5 rounded-full bg-surface-2 p-0.75 text-[13px]"
    >
      {PAYMENT_METHODS.map((m) => {
        const on = m === value
        return (
          <button
            key={m}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(m)}
            className={`flex-1 cursor-pointer rounded-full px-1 py-2 ${
              on ? 'bg-accent text-accent-ink' : 'text-ink'
            }`}
          >
            {m}
          </button>
        )
      })}
    </fieldset>
  )
}
