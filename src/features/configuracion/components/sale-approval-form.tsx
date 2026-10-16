'use client'

import { useActionState } from 'react'
import { SubmitButton } from '@/components/ui/submit-button'
import { type SettingsState, updateSettingsAction } from '../actions'

const INITIAL: SettingsState = { ok: false }

/** Tarjeta "Validación de ventas": interruptor accesible (checkbox nativo oculto + pista visual) y Guardar. */
export function SaleApprovalForm({ requireSaleApproval }: { requireSaleApproval: boolean }) {
  const [state, action] = useActionState(updateSettingsAction, INITIAL)
  // Tras guardar se muestra lo que quedó en la DB; tras un error, lo que el usuario intentó
  const checked = state.values?.requireSaleApproval ?? requireSaleApproval

  return (
    <section
      aria-labelledby="sale-approval-title"
      className="flex max-w-3xl flex-col gap-4 rounded-card border border-line bg-surface p-5 md:p-6"
    >
      <div className="flex flex-col gap-1">
        <h3 id="sale-approval-title" className="font-semibold">
          Validación de ventas
        </h3>
        <p className="text-muted text-sm">
          Con esta opción, las ventas de los cajeros quedan <strong>por validar</strong>: el cliente
          se lleva sus productos, el stock se descuenta y la boleta se numera igual, pero la venta
          no suma a los totales hasta que un administrador la apruebe. Si la rechaza, se anula y los
          productos vuelven al inventario. Las ventas de administradores nunca quedan por validar.
        </p>
      </div>

      <form
        // Remonta si cambia lo guardado para que el interruptor muestre lo vigente
        key={String(requireSaleApproval)}
        action={action}
        className="flex flex-col gap-3.5"
      >
        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            name="requireSaleApproval"
            defaultChecked={checked}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="relative h-6 w-11 flex-none rounded-full border border-line bg-surface-2 transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-4.5 after:rounded-full after:bg-muted after:transition-transform peer-checked:border-accent peer-checked:bg-accent peer-checked:after:translate-x-5 peer-checked:after:bg-accent-ink peer-focus-visible:outline-2 peer-focus-visible:outline-accent peer-focus-visible:outline-offset-2"
          />
          <span className="font-medium">Validar ventas de cajeros</span>
        </label>

        <p className="text-muted text-xs">
          Si la apagas, las ventas que ya están por validar siguen pendientes hasta que un
          administrador las apruebe o las rechace; las nuevas se completan al cobrar.
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
