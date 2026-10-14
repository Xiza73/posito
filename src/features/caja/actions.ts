'use server'

import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { isNextControlFlow } from '@/lib/errors'
import { getCurrentMember } from '@/lib/session'
import { CheckoutError, checkout, InsufficientStockError } from './data/checkout'
import type { SaleSummary } from './lib/receipt'
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
    const { organization, user } = await getCurrentMember()
    const sale = await checkout(db, {
      // La sesión va al final: ningún campo del input puede pisar orgId/userId
      ...parsed.data,
      orgId: organization.id,
      userId: user.id,
    })
    revalidatePath('/caja')
    revalidatePath('/productos')
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
