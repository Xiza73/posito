'use client'

import { useActionState } from 'react'
import { Field, INPUT } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { formatReceiptNumber } from '@/lib/receipt'
import { type ReceiptSeriesState, updateReceiptSeriesAction } from '../actions'

const INITIAL: ReceiptSeriesState = { ok: false }

type Props = { series: string; nextNumber: number }

/** Tarjeta "Numeración de boletas": serie actual, próxima boleta y formulario para cambiarlas. */
export function ReceiptSeriesForm({ series, nextNumber }: Props) {
  const [state, action] = useActionState(updateReceiptSeriesAction, INITIAL)
  const fe = state.fieldErrors ?? {}
  const v = state.values

  return (
    <section
      aria-labelledby="receipt-series-title"
      className="flex max-w-3xl flex-col gap-4 rounded-card border border-line bg-surface p-5 md:p-6"
    >
      <div className="flex flex-col gap-1">
        <h3 id="receipt-series-title" className="font-semibold">
          Numeración de boletas
        </h3>
        <p className="text-muted text-sm">
          La próxima boleta será{' '}
          <output className="font-mono text-ink">{formatReceiptNumber(series, nextNumber)}</output>.
          La serie debe tener el formato de boleta SUNAT: B y 3 dígitos.
        </p>
      </div>

      <form
        // Remonta si cambian los valores guardados para que los campos muestren lo vigente
        key={`${series}-${nextNumber}`}
        action={action}
        className="grid gap-3.5 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
      >
        <Field id="rs-series" label="Serie" error={fe.series?.[0]} hint="Ej. B001">
          <input
            id="rs-series"
            name="series"
            required
            maxLength={4}
            autoComplete="off"
            autoCapitalize="characters"
            defaultValue={v?.series ?? series}
            className={`${INPUT} font-mono uppercase`}
          />
        </Field>
        <Field
          id="rs-next"
          label="Siguiente número"
          error={fe.nextNumber?.[0]}
          hint="Mayor al último emitido en la serie"
        >
          <input
            id="rs-next"
            name="nextNumber"
            required
            inputMode="numeric"
            autoComplete="off"
            defaultValue={v?.nextNumber ?? String(nextNumber)}
            className={`${INPUT} font-mono`}
          />
        </Field>
        <SubmitButton
          pendingLabel="Guardando…"
          className="h-11 rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm sm:mt-6.5"
        >
          Guardar
        </SubmitButton>

        {state.error ? (
          <p role="alert" className="text-bad text-sm sm:col-span-3">
            {state.error}
          </p>
        ) : null}
        {state.ok && state.message ? (
          <p role="status" className="text-ok text-sm sm:col-span-3">
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  )
}
