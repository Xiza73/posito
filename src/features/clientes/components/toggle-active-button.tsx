'use client'

import { useActionState } from 'react'
import { SubmitButton } from '@/components/ui/submit-button'
import { type FormState, toggleCustomerActiveAction } from '../actions'

const INITIAL: FormState = { ok: false }

/** "Eliminar" = desactivar (los clientes no se borran). Reactivar si ya está inactivo. */
export function ToggleActiveButton({
  id,
  name,
  active,
}: {
  id: string
  name: string
  active: boolean
}) {
  const [state, action] = useActionState(toggleCustomerActiveAction, INITIAL)

  return (
    <form action={action} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={String(!active)} />
      <SubmitButton
        pendingLabel={active ? 'Desactivando…' : 'Reactivando…'}
        aria-label={`${active ? 'Desactivar' : 'Reactivar'} ${name}`}
        className="h-9 rounded-ctl border border-line px-3 font-medium text-sm hover:bg-surface-2"
      >
        {active ? 'Desactivar' : 'Reactivar'}
      </SubmitButton>
      {state.error ? (
        <span role="alert" className="text-bad text-xs">
          {state.error}
        </span>
      ) : null}
    </form>
  )
}
