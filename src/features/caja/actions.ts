'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { type CustomerOption, customerInputSchema } from '@/lib/customer-input'
import { createCustomer, DuplicateDocumentError, searchActiveCustomers } from '@/lib/customers'
import { db } from '@/lib/db'
import { isNextControlFlow } from '@/lib/errors'
import { can } from '@/lib/permissions'
import type { SaleSummary } from '@/lib/receipt-lines'
import { ForbiddenError, getCurrentMember, requirePermission } from '@/lib/session'
import { getSettings } from '@/lib/settings'
import { CheckoutError, checkout, InsufficientStockError } from './data/checkout'
import { checkoutInputSchema } from './lib/schemas'

export type CheckoutResult = { ok: true; sale: SaleSummary } | { ok: false; error: string }

const GENERIC_ERROR = 'No se pudo registrar la venta. Inténtalo de nuevo.'

/**
 * Cobra la venta. El cliente solo manda { saleId, paymentMethod, items }; la bodega y el cajero
 * salen de la sesión y los precios de la DB. Cualquier rol puede vender (no hay permiso extra).
 */
export async function checkoutAction(input: unknown): Promise<CheckoutResult> {
  const parsed = checkoutInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'El ticket no es válido. Revisa los productos.' }

  try {
    const { organization, user, member } = await getCurrentMember()
    // Lista blanca: solo quien PUEDE aprobar cobra sin validación. Un rol desconocido o compuesto
    // queda pendiente (falla hacia el lado seguro), en vez de comparar con el string 'cajero'.
    const { requireSaleApproval } = await getSettings(db, organization.id)
    const sale = await checkout(db, {
      // La sesión va al final: ningún campo del input puede pisar orgId/userId/requireApproval
      ...parsed.data,
      orgId: organization.id,
      userId: user.id,
      requireApproval: requireSaleApproval && !can(member.role, { sale: ['approve'] }),
    })
    revalidatePath('/caja')
    revalidatePath('/productos')
    // Si quedó pendiente, el listado de ventas (y el contador del menú) deben mostrarla
    revalidatePath('/ventas')
    return { ok: true, sale }
  } catch (e) {
    if (isNextControlFlow(e)) throw e
    if (e instanceof CheckoutError) {
      // El stock cambió desde que se cargó la caja: refresca el catálogo para que el tope se actualice
      if (e instanceof InsufficientStockError) revalidatePath('/caja')
      return { ok: false, error: e.message }
    }
    console.error('[caja] cobro falló', e)
    return { ok: false, error: GENERIC_ERROR }
  }
}

// --- Cliente de la venta (selector de la caja) ---

export type SearchCustomersResult =
  | { ok: true; customers: CustomerOption[] }
  | { ok: false; error: string }

const searchQuerySchema = z.string().trim().max(80)

/**
 * Clientes ACTIVOS de la bodega que coinciden con el texto (nombre sin tildes o documento).
 * Cualquier miembro puede buscar; la bodega sale de la sesión. Máximo 8 resultados.
 */
export async function searchCustomersAction(query: unknown): Promise<SearchCustomersResult> {
  const parsed = searchQuerySchema.safeParse(query)
  if (!parsed.success) return { ok: false, error: 'La búsqueda no es válida' }

  try {
    const { organization } = await getCurrentMember()
    const customers = await searchActiveCustomers(db, {
      orgId: organization.id,
      query: parsed.data,
    })
    return { ok: true, customers }
  } catch (e) {
    if (isNextControlFlow(e)) throw e
    console.error('[caja] búsqueda de clientes falló', e instanceof Error ? e.name : 'error')
    return { ok: false, error: 'No se pudo buscar clientes. Inténtalo de nuevo.' }
  }
}

/** Valores crudos del alta rápida, para repoblar el formulario tras un error. */
export type QuickCustomerValues = {
  name: string
  documentType: string
  documentNumber: string
  phone: string
}

export type QuickCustomerState = {
  ok: boolean
  customer?: CustomerOption
  error?: string
  fieldErrors?: Record<string, string[] | undefined>
  values?: QuickCustomerValues
}

const formText = (formData: FormData, key: string) => {
  const v = formData.get(key)
  return typeof v === 'string' ? v : ''
}

/**
 * Alta rápida desde la caja (nombre, documento opcional, teléfono) sin salir del cobro. Mismo
 * esquema y misma inserción que Clientes (src/lib/customers.ts); exige `customer:create`.
 */
export async function quickCreateCustomerAction(
  _prev: QuickCustomerState,
  formData: FormData,
): Promise<QuickCustomerState> {
  const values: QuickCustomerValues = {
    name: formText(formData, 'name'),
    documentType: formText(formData, 'documentType'),
    documentNumber: formText(formData, 'documentNumber'),
    phone: formText(formData, 'phone'),
  }
  const parsed = customerInputSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, values, fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  try {
    const { organization } = await getCurrentMember()
    await requirePermission({ customer: ['create'] })
    const customer = await createCustomer(db, { orgId: organization.id, input: parsed.data })
    return { ok: true, customer }
  } catch (e) {
    if (isNextControlFlow(e)) throw e
    if (e instanceof ForbiddenError) return { ok: false, values, error: e.message }
    if (e instanceof DuplicateDocumentError) {
      return { ok: false, values, fieldErrors: { documentNumber: [e.message] } }
    }
    // Sin datos personales en el registro
    console.error('[caja] alta rápida de cliente falló', e instanceof Error ? e.name : 'error')
    return { ok: false, values, error: 'No se pudo registrar el cliente. Inténtalo de nuevo.' }
  }
}
