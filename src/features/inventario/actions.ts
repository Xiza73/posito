'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { isNextControlFlow } from '@/lib/errors'
import { ForbiddenError, getCurrentMember, requirePermission } from '@/lib/session'
import { revalidateStore } from '@/lib/store-cache'
import {
  adjustStock,
  countStock,
  type IngresoResult,
  InventoryError,
  registerIngreso,
} from './data/inventory'
import {
  adjustInputSchema,
  batchIngresoInputSchema,
  countInputSchema,
  ingresoInputSchema,
} from './lib/schemas'

export type InventoryFormState = {
  ok: boolean
  /** Confirmación para mostrar tras un éxito (o un conteo que no cambió nada). */
  message?: string
  error?: string
  fieldErrors?: Record<string, string[] | undefined>
}

const GENERIC_ERROR = 'No se pudo completar la acción. Inténtalo de nuevo.'

const text = (formData: FormData, key: string) => {
  const v = formData.get(key)
  return typeof v === 'string' ? v : ''
}

/** Un ingreso/ajuste/conteo cambia stock: refresca inventario (y sus subrutas), productos y caja. */
async function revalidateStock() {
  revalidatePath('/inventario', 'layout')
  revalidatePath('/productos')
  revalidatePath('/caja')
  await revalidateStore()
}

function invalid(error: z.ZodError): InventoryFormState {
  const fieldErrors: Record<string, string[] | undefined> = z.flattenError(error).fieldErrors
  const first = Object.values(fieldErrors).flat()[0]
  return { ok: false, error: first ?? 'Revisa los datos del formulario', fieldErrors }
}

/** Traduce errores a mensajes seguros: jamás se filtra el error crudo al cliente. */
function toErrorState(e: unknown): InventoryFormState {
  if (isNextControlFlow(e)) throw e
  // Estos mensajes están escritos para el usuario; el resto se registra y se oculta
  if (e instanceof ForbiddenError || e instanceof InventoryError) {
    return { ok: false, error: e.message }
  }
  console.error('[inventario] acción falló', e)
  return { ok: false, error: GENERIC_ERROR }
}

/** La bodega y el usuario salen de la sesión, nunca del formulario. Solo owner/admin. */
async function authorizeAdjust() {
  const current = await getCurrentMember()
  await requirePermission({ stock: ['adjust'] })
  return current
}

const units = (n: number) => `${n} ${n === 1 ? 'unidad' : 'unidades'}`

function ingresoMessage(res: IngresoResult): string {
  if (res.lines.length === 1) {
    const [l] = res.lines
    return `Ingreso registrado: +${l.quantity} de ${l.name}. Stock actual: ${l.stock} u.`
  }
  return `Ingreso registrado: ${res.lines.length} productos, ${units(res.units)} en total.`
}

/** Ingreso de mercadería de UN producto. */
export async function ingresoAction(
  _prev: InventoryFormState,
  formData: FormData,
): Promise<InventoryFormState> {
  const parsed = ingresoInputSchema.safeParse({
    productId: text(formData, 'productId'),
    quantity: text(formData, 'quantity'),
    note: text(formData, 'note'),
  })
  if (!parsed.success) return invalid(parsed.error)

  try {
    const { organization, user } = await authorizeAdjust()
    const res = await registerIngreso(db, {
      orgId: organization.id,
      userId: user.id,
      ...parsed.data,
    })
    await revalidateStock()
    return { ok: true, message: ingresoMessage(res) }
  } catch (e) {
    return toErrorState(e)
  }
}

/** Ingreso en lote: las líneas llegan como JSON en el campo `lines`; una sola transacción. */
export async function batchIngresoAction(
  _prev: InventoryFormState,
  formData: FormData,
): Promise<InventoryFormState> {
  let lines: unknown
  try {
    lines = JSON.parse(text(formData, 'lines') || '[]')
  } catch {
    return { ok: false, error: 'Las líneas del ingreso no son válidas' }
  }
  const parsed = batchIngresoInputSchema.safeParse({ lines, note: text(formData, 'note') })
  if (!parsed.success) return invalid(parsed.error)

  try {
    const { organization, user } = await authorizeAdjust()
    const res = await registerIngreso(db, {
      orgId: organization.id,
      userId: user.id,
      ...parsed.data,
    })
    await revalidateStock()
    return { ok: true, message: ingresoMessage(res) }
  } catch (e) {
    return toErrorState(e)
  }
}

/** Ajuste manual (+/- N) con motivo. */
export async function adjustAction(
  _prev: InventoryFormState,
  formData: FormData,
): Promise<InventoryFormState> {
  const parsed = adjustInputSchema.safeParse({
    productId: text(formData, 'productId'),
    direction: text(formData, 'direction'),
    quantity: text(formData, 'quantity'),
    reasonCode: text(formData, 'reasonCode'),
    otherText: text(formData, 'otherText'),
  })
  if (!parsed.success) return invalid(parsed.error)

  try {
    const { organization, user } = await authorizeAdjust()
    const res = await adjustStock(db, {
      orgId: organization.id,
      userId: user.id,
      ...parsed.data,
    })
    await revalidateStock()
    return {
      ok: true,
      message: `Stock de ${res.name} ajustado: ${res.previous} → ${res.stock} u.`,
    }
  } catch (e) {
    return toErrorState(e)
  }
}

/**
 * Conteo físico. Del cliente solo viene la cantidad contada: la diferencia se calcula en el
 * servidor contra el stock leído bajo bloqueo. Si coincide, no se registra nada.
 */
export async function countAction(
  _prev: InventoryFormState,
  formData: FormData,
): Promise<InventoryFormState> {
  const parsed = countInputSchema.safeParse({
    productId: text(formData, 'productId'),
    counted: text(formData, 'counted'),
    note: text(formData, 'note'),
  })
  if (!parsed.success) return invalid(parsed.error)

  try {
    const { organization, user } = await authorizeAdjust()
    const res = await countStock(db, {
      orgId: organization.id,
      userId: user.id,
      ...parsed.data,
    })
    if (!res.changed) return { ok: true, message: 'El stock ya coincide' }
    await revalidateStock()
    const sign = res.delta > 0 ? `+${res.delta}` : String(res.delta)
    return {
      ok: true,
      message: `Conteo registrado para ${res.name}: ${res.previous} → ${res.stock} u. (${sign})`,
    }
  } catch (e) {
    return toErrorState(e)
  }
}
