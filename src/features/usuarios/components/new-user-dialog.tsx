'use client'

import { useActionState, useRef } from 'react'
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '@/lib/permissions'
import { createCashier, type FormState } from '../actions'

const INITIAL: FormState = { ok: false }
const INPUT =
  'h-11 rounded-ctl border border-line bg-page px-3 text-ink outline-none focus-visible:border-accent'

export function NewUserDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null)

  async function submit(prev: FormState, formData: FormData) {
    const result = await createCashier(prev, formData)
    if (result.ok) dialogRef.current?.close()
    return result
  }

  const [state, action, pending] = useActionState(submit, INITIAL)
  const fe = state.fieldErrors ?? {}

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="h-10 cursor-pointer rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm"
      >
        Nuevo usuario
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="new-user-title"
        className="m-auto w-[min(92vw,26rem)] rounded-card border border-line bg-surface p-6 text-ink shadow-pop backdrop:bg-black/40"
      >
        <h2 id="new-user-title" className="mb-4 font-semibold text-lg">
          Nuevo usuario
        </h2>
        {/* key: al reabrir tras un alta exitosa el formulario vuelve vacío */}
        <form action={action} key={state.ok ? 'done' : 'form'} className="flex flex-col gap-3.5">
          <Field id="nu-name" label="Nombre" error={fe.name?.[0]}>
            <input
              name="name"
              required
              minLength={2}
              maxLength={80}
              autoComplete="off"
              defaultValue={state.values?.name}
              className={INPUT}
            />
          </Field>
          <Field id="nu-email" label="Correo" error={fe.email?.[0]}>
            <input
              name="email"
              type="email"
              required
              autoComplete="off"
              defaultValue={state.values?.email}
              className={INPUT}
            />
          </Field>
          <Field
            id="nu-password"
            label="Contraseña inicial"
            error={fe.password?.[0]}
            hint="Mínimo 8 caracteres"
          >
            <input
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className={INPUT}
            />
          </Field>
          <Field id="nu-role" label="Rol" error={fe.role?.[0]}>
            <select name="role" defaultValue={state.values?.role ?? 'cajero'} className={INPUT}>
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </Field>

          {state.error ? (
            <p role="alert" className="text-bad text-sm">
              {state.error}
            </p>
          ) : null}

          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="h-10 cursor-pointer rounded-ctl border border-line px-4 font-medium text-sm hover:bg-surface-2"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending}
              className="h-10 cursor-pointer rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm disabled:cursor-wait disabled:opacity-60"
            >
              {pending ? 'Creando…' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5 text-muted text-sm">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span role="alert" className="text-bad text-xs">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs">{hint}</span>
      ) : null}
    </div>
  )
}
