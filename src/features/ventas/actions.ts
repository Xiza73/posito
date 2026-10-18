'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { isNextControlFlow } from '@/lib/errors'
import { ForbiddenError, getCurrentMember, requirePermission } from '@/lib/session'
import { revalidateStore } from '@/lib/store-cache'
import { approveSale, SaleError, voidSale } from './data/sales'
import { voidInputSchema } from './lib/schemas'

export type VoidFormState = {
  ok: boolean
  error?: string
  fieldErrors?: Record<string, string[] | undefined>
}

const GENERIC_ERROR = 'No se pudo anular la venta. Inténtalo de nuevo.'

const text = (formData: FormData, key: string) => {
  const v = formData.get(key)
  return typeof v === 'string' ? v : ''
}

/**
 * Anula una venta. La bodega y el usuario salen de la sesión; del formulario solo vienen el id, el
 * código del motivo y el texto de "Otro". Exige el permiso `sale:void` (administrador/propietario).
 */
export async function voidSaleAction(
  _prev: VoidFormState,
  formData: FormData,
): Promise<VoidFormState> {
  const parsed = voidInputSchema.safeParse({
    id: text(formData, 'id'),
    reasonCode: text(formData, 'reasonCode'),
    otherText: text(formData, 'otherText'),
    expectedStatus: text(formData, 'expectedStatus') || undefined,
  })
  if (!parsed.success) {
    const fieldErrors = z.flattenError(parsed.error).fieldErrors
    const first = Object.values(fieldErrors).flat()[0]
    return { ok: false, error: first ?? 'Revisa el motivo de la anulación', fieldErrors }
  }

  try {
    const { organization, user } = await getCurrentMember()
    await requirePermission({ sale: ['void'] })
    await voidSale(db, {
      orgId: organization.id,
      userId: user.id,
      id: parsed.data.id,
      reason: parsed.data.reason,
      expectedStatus: parsed.data.expectedStatus,
    })
  } catch (e) {
    if (isNextControlFlow(e)) throw e
    // Estos mensajes están escritos para el usuario; el resto se registra y se oculta
    if (e instanceof ForbiddenError || e instanceof SaleError)
      return { ok: false, error: e.message }
    console.error('[ventas] anulación falló', e)
    return { ok: false, error: GENERIC_ERROR }
  }

  // La anulación devuelve stock: refrescar ventas, detalle, caja y productos
  await revalidateSaleChange(parsed.data.id)
  return { ok: true }
}

async function revalidateSaleChange(id: string) {
  revalidatePath('/ventas')
  revalidatePath(`/ventas/${id}`)
  revalidatePath('/caja')
  revalidatePath('/productos')
  // Anular/rechazar devuelve stock: la tienda debe dejar de mostrar "Agotado"
  await revalidateStore()
}

export type ApproveResult = { ok: true } | { ok: false; error: string }

/**
 * Aprueba una venta pendiente de validación. Exige `sale:approve` (administrador/propietario).
 * Rechazarla es `voidSaleAction` (devuelve el stock) con el permiso `sale:void`.
 */
export async function approveSaleAction(input: unknown): Promise<ApproveResult> {
  const parsed = z.uuid().safeParse(input)
  if (!parsed.success) return { ok: false, error: 'La venta no es válida' }

  try {
    const { organization, user } = await getCurrentMember()
    await requirePermission({ sale: ['approve'] })
    await approveSale(db, { orgId: organization.id, userId: user.id, id: parsed.data })
  } catch (e) {
    if (isNextControlFlow(e)) throw e
    if (e instanceof ForbiddenError || e instanceof SaleError)
      return { ok: false, error: e.message }
    console.error('[ventas] aprobación falló', e)
    return { ok: false, error: 'No se pudo aprobar la venta. Inténtalo de nuevo.' }
  }

  await revalidateSaleChange(parsed.data)
  return { ok: true }
}
