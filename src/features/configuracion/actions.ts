'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { isNextControlFlow } from '@/lib/errors'
import { ForbiddenError, getCurrentMember, requirePermission } from '@/lib/session'
import { updateReceiptSeries } from './data/receipt-series'
import { receiptSeriesSchema } from './lib/schemas'

export type ReceiptSeriesState = {
  ok: boolean
  message?: string
  error?: string
  fieldErrors?: Record<string, string[] | undefined>
  /** Valores crudos para repoblar el formulario tras un error. */
  values?: { series: string; nextNumber: string }
}

const GENERIC_ERROR = 'No se pudo completar la acción. Inténtalo de nuevo.'

const text = (formData: FormData, key: string) => {
  const v = formData.get(key)
  return typeof v === 'string' ? v : ''
}

export async function updateReceiptSeriesAction(
  _prev: ReceiptSeriesState,
  formData: FormData,
): Promise<ReceiptSeriesState> {
  const values = { series: text(formData, 'series'), nextNumber: text(formData, 'nextNumber') }
  const parsed = receiptSeriesSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, values, fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  try {
    // La bodega sale de la sesión; solo owner/admin (organization:update) pueden cambiar la numeración
    const { organization } = await getCurrentMember()
    await requirePermission({ organization: ['update'] })
    const res = await updateReceiptSeries(db, { orgId: organization.id, ...parsed.data })
    if (!res.ok) return { ok: false, values, fieldErrors: { nextNumber: [res.error] } }
  } catch (e) {
    if (isNextControlFlow(e)) throw e
    if (e instanceof ForbiddenError) return { ok: false, values, error: e.message }
    console.error('[configuracion] actualizar serie falló', e)
    return { ok: false, values, error: GENERIC_ERROR }
  }

  revalidatePath('/configuracion')
  return { ok: true, message: 'Numeración actualizada' }
}
