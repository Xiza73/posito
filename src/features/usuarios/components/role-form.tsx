'use client'

import { useActionState } from 'react'
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '@/lib/permissions'
import { changeRole, type FormState } from '../actions'

const INITIAL: FormState = { ok: false }

export function RoleForm({ memberId, role }: { memberId: string; role: string }) {
  const [state, action, pending] = useActionState(changeRole, INITIAL)

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="memberId" value={memberId} />
      <select
        name="role"
        defaultValue={role}
        aria-label="Rol"
        className="h-9 rounded-ctl border border-line bg-page px-2 text-sm"
      >
        {ASSIGNABLE_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="h-9 cursor-pointer rounded-ctl border border-line px-3 font-medium text-sm hover:bg-surface-2 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? 'Guardando…' : 'Guardar'}
      </button>
      {state.error ? (
        <span role="alert" className="text-bad text-xs">
          {state.error}
        </span>
      ) : null}
      {state.ok ? (
        <span role="status" className="text-ok text-xs">
          {state.message}
        </span>
      ) : null}
    </form>
  )
}
