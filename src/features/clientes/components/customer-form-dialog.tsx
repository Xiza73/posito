'use client'

import { useActionState, useEffect, useRef } from 'react'
import { DocumentFields } from '@/components/customer/document-fields'
import { Field, INPUT } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { MAX_NAME } from '@/lib/customer-input'
import { createCustomerAction, type FormState, updateCustomerAction } from '../actions'

const INITIAL: FormState = { ok: false }

/** Lo que el formulario necesita para editar (el resto del cliente no hace falta). */
export type EditableCustomer = {
  id: string
  name: string
  documentType: string | null
  documentNumber: string | null
  phone: string | null
  email: string | null
  address: string | null
}

type Props = {
  /** 'new' = alta, un cliente = edición, null = cerrado. */
  target: EditableCustomer | 'new' | null
  onClose: () => void
}

export function CustomerFormDialog({ target, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (target && !el.open) el.showModal()
    if (!target && el.open) el.close()
  }, [target])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="customer-dialog-title"
      className="m-auto max-h-[92vh] w-[min(94vw,32rem)] overflow-auto rounded-card border border-line bg-surface p-6 text-ink shadow-pop backdrop:bg-black/40"
    >
      {/* Se monta solo abierto: cada apertura empieza con un estado de formulario limpio */}
      {target ? (
        <CustomerForm
          key={target === 'new' ? 'new' : target.id}
          customer={target === 'new' ? null : target}
          onClose={onClose}
        />
      ) : null}
    </dialog>
  )
}

function CustomerForm({
  customer,
  onClose,
}: {
  customer: EditableCustomer | null
  onClose: () => void
}) {
  const editing = customer !== null

  async function submit(prev: FormState, formData: FormData) {
    const result = await (editing ? updateCustomerAction : createCustomerAction)(prev, formData)
    if (result.ok) onClose()
    return result
  }

  const [state, action] = useActionState(submit, INITIAL)
  const fe = state.fieldErrors ?? {}
  const v = state.values

  return (
    <>
      <h2 id="customer-dialog-title" className="mb-4 font-semibold text-lg">
        {editing ? 'Editar cliente' : 'Nuevo cliente'}
      </h2>
      <form action={action} className="flex flex-col gap-3.5">
        {customer ? <input type="hidden" name="id" value={customer.id} /> : null}

        <Field id="cf-name" label="Nombre o razón social" error={fe.name?.[0]}>
          <input
            id="cf-name"
            name="name"
            required
            minLength={2}
            maxLength={MAX_NAME}
            autoComplete="off"
            defaultValue={v?.name ?? customer?.name}
            className={INPUT}
          />
        </Field>

        <DocumentFields
          idPrefix="cf"
          defaultType={v?.documentType ?? customer?.documentType ?? ''}
          defaultNumber={v?.documentNumber ?? customer?.documentNumber ?? ''}
          typeError={fe.documentType?.[0]}
          numberError={fe.documentNumber?.[0]}
        />

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field id="cf-phone" label="Teléfono" error={fe.phone?.[0]} hint="Opcional">
            <input
              id="cf-phone"
              name="phone"
              type="tel"
              maxLength={20}
              autoComplete="off"
              defaultValue={v?.phone ?? customer?.phone ?? ''}
              className={INPUT}
            />
          </Field>
          <Field id="cf-email" label="Correo" error={fe.email?.[0]} hint="Opcional">
            <input
              id="cf-email"
              name="email"
              type="email"
              maxLength={120}
              autoComplete="off"
              defaultValue={v?.email ?? customer?.email ?? ''}
              className={INPUT}
            />
          </Field>
        </div>

        <Field id="cf-address" label="Dirección" error={fe.address?.[0]} hint="Opcional">
          <input
            id="cf-address"
            name="address"
            maxLength={160}
            autoComplete="off"
            defaultValue={v?.address ?? customer?.address ?? ''}
            className={INPUT}
          />
        </Field>

        {state.error ? (
          <p role="alert" className="text-bad text-sm">
            {state.error}
          </p>
        ) : null}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 cursor-pointer rounded-ctl border border-line px-4 font-medium text-sm hover:bg-surface-2"
          >
            Cancelar
          </button>
          <SubmitButton
            pendingLabel="Guardando…"
            className="h-10 rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm"
          >
            {editing ? 'Guardar cambios' : 'Registrar cliente'}
          </SubmitButton>
        </div>
      </form>
    </>
  )
}
