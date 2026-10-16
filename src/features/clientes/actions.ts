'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { customerInputSchema } from '@/lib/customer-input'
import { db } from '@/lib/db'
import { isNextControlFlow } from '@/lib/errors'
import {
  ForbiddenError,
  getCurrentMember,
  type Permissions,
  requirePermission,
} from '@/lib/session'
import {
  createCustomer,
  DuplicateDocumentError,
  setCustomerActive,
  updateCustomer,
} from './data/customers'

/** Valores crudos del formulario, para repoblarlo tras un error. */
export type CustomerFormValues = {
  name: string
  documentType: string
  documentNumber: string
  phone: string
  email: string
  address: string
}

export type FormState = {
  ok: boolean
  message?: string
  error?: string
  fieldErrors?: Record<string, string[] | undefined>
  values?: CustomerFormValues
}

const GENERIC_ERROR = 'No se pudo completar la acción. Inténtalo de nuevo.'
const NOT_FOUND = 'No se encontró el cliente'

const text = (formData: FormData, key: string) => {
  const v = formData.get(key)
  return typeof v === 'string' ? v : ''
}

/** Autoriza con la sesión: la bodega y el usuario salen de aquí, nunca del formulario. */
async function authorize(permissions: Permissions) {
  const current = await getCurrentMember()
  await requirePermission(permissions)
  return current
}

function readCustomerForm(formData: FormData) {
  const values: CustomerFormValues = {
    name: text(formData, 'name'),
    documentType: text(formData, 'documentType'),
    documentNumber: text(formData, 'documentNumber'),
    phone: text(formData, 'phone'),
    email: text(formData, 'email'),
    address: text(formData, 'address'),
  }
  return { values, parsed: customerInputSchema.safeParse(values) }
}

/**
 * Traduce errores a mensajes seguros: jamás se filtra el error crudo al cliente.
 * Los datos personales del formulario (teléfono, correo, dirección) no se registran.
 */
function toErrorState(e: unknown, values?: CustomerFormValues): FormState {
  if (isNextControlFlow(e)) throw e
  if (e instanceof ForbiddenError) return { ok: false, values, error: e.message }
  if (e instanceof DuplicateDocumentError) {
    return { ok: false, values, fieldErrors: { documentNumber: [e.message] } }
  }
  console.error('[clientes] acción falló', e instanceof Error ? e.name : 'error')
  return { ok: false, values, error: GENERIC_ERROR }
}

function revalidateCustomers(id?: string) {
  revalidatePath('/clientes')
  if (id) revalidatePath(`/clientes/${id}`)
}

export async function createCustomerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { values, parsed } = readCustomerForm(formData)
  if (!parsed.success) {
    return { ok: false, values, fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  try {
    const { organization } = await authorize({ customer: ['create'] })
    await createCustomer(db, { orgId: organization.id, input: parsed.data })
  } catch (e) {
    return toErrorState(e, values)
  }

  revalidateCustomers()
  return { ok: true, message: `Cliente ${parsed.data.name} registrado` }
}

export async function updateCustomerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { values, parsed } = readCustomerForm(formData)
  const id = z.uuid().safeParse(text(formData, 'id'))
  if (!id.success) return { ok: false, values, error: NOT_FOUND }
  if (!parsed.success) {
    return { ok: false, values, fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  try {
    const { organization, member } = await authorize({ customer: ['update'] })
    const done = await updateCustomer(db, {
      orgId: organization.id,
      role: member.role,
      id: id.data,
      input: parsed.data,
    })
    if (!done) return { ok: false, values, error: NOT_FOUND }
  } catch (e) {
    return toErrorState(e, values)
  }

  revalidateCustomers(id.data)
  return { ok: true, message: 'Cliente actualizado' }
}

/** Desactivar y reactivar piden `customer:delete` (administrador/propietario). */
export async function toggleCustomerActiveAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = z.uuid().safeParse(text(formData, 'id'))
  const active = text(formData, 'active') === 'true'
  if (!id.success) return { ok: false, error: NOT_FOUND }

  try {
    const { organization } = await authorize({ customer: ['delete'] })
    const done = await setCustomerActive(db, { orgId: organization.id, id: id.data, active })
    if (!done) return { ok: false, error: NOT_FOUND }
  } catch (e) {
    return toErrorState(e)
  }

  revalidateCustomers(id.data)
  return { ok: true, message: active ? 'Cliente reactivado' : 'Cliente desactivado' }
}
