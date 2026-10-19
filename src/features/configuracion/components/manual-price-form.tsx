'use client'

import { useActionState } from 'react'
import { SubmitButton } from '@/components/ui/submit-button'
import { type SettingsState, updateManualPriceAction } from '../actions'

const INITIAL: SettingsState = { ok: false }

/** Tarjeta "Precios en la Caja": interruptor para permitir editar el total de una línea. */
export function ManualPriceForm({ allowManualPrice }: { allowManualPrice: boolean }) {
  const [state, action] = useActionState(updateManualPriceAction, INITIAL)
  // Tras guardar se muestra lo que quedó en la DB; tras un error, lo que el usuario intentó
  const checked = state.values?.allowManualPrice ?? allowManualPrice

  return (
    <section
      aria-labelledby="manual-price-title"
      className="flex max-w-3xl flex-col gap-4 rounded-card border border-line bg-surface p-5 md:p-6"
    >
      <div className="flex flex-col gap-1">
        <h3 id="manual-price-title" className="font-semibold">
          Precios en la Caja
        </h3>
        <p className="text-muted text-sm">
          Con esta opción, <strong>cualquier usuario</strong> (administradores y cajeros) puede
          cambiar el importe total de una línea del ticket al cobrar, hacia arriba o hacia abajo
          (mínimo S/ 0.01). El precio escrito reemplaza al precio normal y al precio por mayor de
          esa línea. Cada venta guarda el precio automático y el cobrado, y en el detalle de la
          venta queda marcado quién la cobró con precio editado. La boleta del cliente solo muestra
          el importe final.
        </p>
      </div>

      <form
        // Remonta si cambia lo guardado para que el interruptor muestre lo vigente
        key={String(allowManualPrice)}
        action={action}
        className="flex flex-col gap-3.5"
      >
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="allowManualPrice"
            defaultChecked={checked}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="relative h-6 w-11 flex-none rounded-full border border-line bg-surface-2 transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-4.5 after:rounded-full after:bg-muted after:transition-transform peer-checked:border-accent peer-checked:bg-accent peer-checked:after:translate-x-5 peer-checked:after:bg-accent-ink peer-focus-visible:outline-2 peer-focus-visible:outline-accent peer-focus-visible:outline-offset-2"
          />
          <span className="font-medium">Permitir editar precios en la Caja</span>
        </label>

        <p className="text-muted text-xs">
          Si la apagas, las ventas ya registradas conservan sus precios; las nuevas vuelven a usar
          siempre el precio del producto.
        </p>

        <div>
          <SubmitButton
            pendingLabel="Guardando…"
            className="h-11 rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm"
          >
            Guardar
          </SubmitButton>
        </div>

        {state.error ? (
          <p role="alert" className="text-bad text-sm">
            {state.error}
          </p>
        ) : null}
        {state.ok && state.message ? (
          <p role="status" className="text-ok text-sm">
            {state.message}
          </p>
        ) : null}
      </form>
    </section>
  )
}
