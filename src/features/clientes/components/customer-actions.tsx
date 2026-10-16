'use client'

import { useState } from 'react'
import { CustomerFormDialog, type EditableCustomer } from './customer-form-dialog'
import { ToggleActiveButton } from './toggle-active-button'

type Props = {
  customer: EditableCustomer & { active: boolean }
  canUpdate: boolean
  canDelete: boolean
}

/** Editar (customer:update) y desactivar/reactivar (customer:delete) desde el perfil. */
export function CustomerActions({ customer, canUpdate, canDelete }: Props) {
  const [editing, setEditing] = useState(false)
  if (!canUpdate && !canDelete) return null

  return (
    <div className="flex items-start gap-2">
      {canUpdate ? (
        <>
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Editar ${customer.name}`}
            className="h-9 cursor-pointer rounded-ctl border border-line px-3 font-medium text-sm hover:bg-surface-2"
          >
            Editar
          </button>
          <CustomerFormDialog
            target={editing ? customer : null}
            onClose={() => setEditing(false)}
          />
        </>
      ) : null}
      {canDelete ? (
        <ToggleActiveButton id={customer.id} name={customer.name} active={customer.active} />
      ) : null}
    </div>
  )
}
