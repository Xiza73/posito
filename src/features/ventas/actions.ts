'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { isNextControlFlow } from '@/lib/errors'
import { ForbiddenError, getCurrentMember, requirePermission } from '@/lib/session'
import { SaleError, voidSale } from './data/sales'
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
  revalidatePath('/ventas')
  revalidatePath(`/ventas/${parsed.data.id}`)
  revalidatePath('/caja')
  revalidatePath('/productos')
  return { ok: true }
}
