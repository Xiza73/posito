'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { DocumentFields } from '@/components/customer/document-fields'
import { Field, INPUT } from '@/components/ui/field'
import { Icon } from '@/components/ui/icon'
import { SubmitButton } from '@/components/ui/submit-button'
import { type CustomerOption, MAX_NAME } from '@/lib/customer-input'
import { formatDocument } from '@/lib/document'
import {
  type QuickCustomerState,
  quickCreateCustomerAction,
  searchCustomersAction,
} from '../actions'

type Props = {
  /** Se monta solo abierto; `onClose` lo desmonta. */
  onClose: () => void
  onPick: (customer: CustomerOption) => void
  /** `customer:create`: sin el permiso no se ofrece el alta rápida. */
  canCreate: boolean
}

const INITIAL: QuickCustomerState = { ok: false }

/**
 * Selector de cliente de la caja en un `<dialog>` nativo: busca por nombre (sin tildes) o documento
 * y permite registrar un cliente nuevo sin salir del cobro.
 */
export function CustomerPicker({ onClose, onPick, canCreate }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [mode, setMode] = useState<'search' | 'new'>('search')

  useEffect(() => {
    const el = ref.current
    if (el && !el.open) el.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="customer-picker-title"
      className="m-auto max-h-[92vh] w-[min(94vw,28rem)] overflow-auto rounded-card border border-line bg-surface p-5 text-ink shadow-pop backdrop:bg-black/40"
    >
      {mode === 'search' ? (
        <SearchView
          canCreate={canCreate}
          onPick={onPick}
          onNew={() => setMode('new')}
          onClose={onClose}
        />
      ) : (
        <NewView onPick={onPick} onBack={() => setMode('search')} />
      )}
    </dialog>
  )
}

function SearchView({
  canCreate,
  onPick,
  onNew,
  onClose,
}: {
  canCreate: boolean
  onPick: (c: CustomerOption) => void
  onNew: () => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerOption[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Búsqueda con pausa de 250 ms al teclear; una respuesta vieja nunca pisa a una más nueva
  useEffect(() => {
    let stale = false
    const timer = setTimeout(
      async () => {
        const res = await searchCustomersAction(query)
        if (stale) return
        if (res.ok) {
          setResults(res.customers)
          setError(null)
        } else {
          setError(res.error)
        }
      },
      query ? 250 : 0,
    )
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [query])

  return (
    <>
      <h2 id="customer-picker-title" className="mb-3 font-semibold text-lg">
        Cliente de la venta
      </h2>
      <label className="field-box flex h-11 items-center gap-2.5 rounded-ctl border border-line bg-page px-3.5">
        <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5" />
        <span className="sr-only">Buscar cliente por nombre, DNI o RUC</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          maxLength={80}
          // biome-ignore lint/a11y/noAutofocus: el diálogo se abre para buscar; el foco debe caer en el campo
          autoFocus
          autoComplete="off"
          placeholder="Buscar por nombre, DNI o RUC"
          className="w-0 min-w-0 flex-1 bg-transparent text-sm"
        />
      </label>

      <div aria-live="polite" className="mt-3 min-h-24">
        {error ? (
          <p role="alert" className="text-bad text-sm">
            {error}
          </p>
        ) : results === null ? (
          <p className="text-muted text-sm">Buscando…</p>
        ) : results.length === 0 ? (
          <p className="text-muted text-sm">
            {query ? 'No hay clientes que coincidan.' : 'Aún no hay clientes registrados.'}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onPick(c)}
                  className="flex w-full cursor-pointer flex-col rounded-ctl border border-line px-3 py-2 text-left text-sm hover:border-accent hover:bg-surface-2"
                >
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted text-xs">
                    <span className="font-mono">
                      {c.documentType && c.documentNumber
                        ? formatDocument(c.documentType, c.documentNumber)
                        : 'Sin documento'}
                    </span>
                    {c.phone ? ` · ${c.phone}` : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex flex-wrap justify-between gap-2">
        {canCreate ? (
          <button
            type="button"
            onClick={onNew}
            className="h-10 cursor-pointer rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm"
          >
            Nuevo cliente
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onClose}
          className="h-10 cursor-pointer rounded-ctl border border-line px-4 font-medium text-sm hover:bg-surface-2"
        >
          Cancelar
        </button>
      </div>
    </>
  )
}

function NewView({ onPick, onBack }: { onPick: (c: CustomerOption) => void; onBack: () => void }) {
  async function submit(prev: QuickCustomerState, formData: FormData) {
    const result = await quickCreateCustomerAction(prev, formData)
    if (result.ok && result.customer) onPick(result.customer)
    return result
  }

  const [state, action] = useActionState(submit, INITIAL)
  const fe = state.fieldErrors ?? {}
  const v = state.values

  return (
    <>
      <h2 id="customer-picker-title" className="mb-3 font-semibold text-lg">
        Nuevo cliente
      </h2>
      <form action={action} className="flex flex-col gap-3.5">
        <Field id="qc-name" label="Nombre o razón social" error={fe.name?.[0]}>
          <input
            id="qc-name"
            name="name"
            required
            minLength={2}
            maxLength={MAX_NAME}
            // biome-ignore lint/a11y/noAutofocus: el formulario acaba de abrirse para escribir el nombre
            autoFocus
            autoComplete="off"
            defaultValue={v?.name}
            className={INPUT}
          />
        </Field>
        <DocumentFields
          idPrefix="qc"
          defaultType={v?.documentType}
          defaultNumber={v?.documentNumber}
          typeError={fe.documentType?.[0]}
          numberError={fe.documentNumber?.[0]}
        />
        <Field id="qc-phone" label="Teléfono" error={fe.phone?.[0]} hint="Opcional">
          <input
            id="qc-phone"
            name="phone"
            type="tel"
            maxLength={20}
            autoComplete="off"
            defaultValue={v?.phone}
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
            onClick={onBack}
            className="h-10 cursor-pointer rounded-ctl border border-line px-4 font-medium text-sm hover:bg-surface-2"
          >
            Volver
          </button>
          <SubmitButton
            pendingLabel="Guardando…"
            className="h-10 rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm"
          >
            Registrar y usar
          </SubmitButton>
        </div>
      </form>
    </>
  )
}
