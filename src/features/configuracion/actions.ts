'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { isNextControlFlow } from '@/lib/errors'
import { ForbiddenError, getCurrentMember, requirePermission } from '@/lib/session'
import { updateBusinessProfile, updateSettings } from '@/lib/settings'
import { revalidateStore } from '@/lib/store-cache'
import { updateStoreSettings } from '@/lib/store-settings'
import { updateReceiptSeries } from './data/receipt-series'
import {
  businessProfileSchema,
  manualPriceSchema,
  receiptSeriesSchema,
  settingsSchema,
  storeSettingsSchema,
} from './lib/schemas'

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

export type SettingsState = {
  ok: boolean
  message?: string
  error?: string
  /** Lo que el usuario intentó guardar, para repoblar el interruptor tras un error. */
  values?: { requireSaleApproval?: boolean; allowManualPrice?: boolean }
}

/** Guarda los ajustes de la bodega (hoy: validación de ventas). Exige `organization:update`. */
export async function updateSettingsAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = settingsSchema.safeParse({
    requireSaleApproval: formData.get('requireSaleApproval') !== null,
  })
  if (!parsed.success) return { ok: false, error: 'Revisa los ajustes' }
  const values = parsed.data

  try {
    // La bodega sale de la sesión, nunca del formulario
    const { organization } = await getCurrentMember()
    await requirePermission({ organization: ['update'] })
    await updateSettings(db, organization.id, values)
  } catch (e) {
    if (isNextControlFlow(e)) throw e
    if (e instanceof ForbiddenError) return { ok: false, values, error: e.message }
    console.error('[configuracion] guardar ajustes falló', e)
    return { ok: false, values, error: GENERIC_ERROR }
  }

  revalidatePath('/configuracion')
  return { ok: true, values, message: 'Ajustes guardados' }
}

/** Guarda "Precios en la Caja" (editar el total de una línea). Exige `organization:update`. */
export async function updateManualPriceAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const parsed = manualPriceSchema.safeParse({
    allowManualPrice: formData.get('allowManualPrice') !== null,
  })
  if (!parsed.success) return { ok: false, error: 'Revisa los ajustes' }
  const values = parsed.data

  try {
    // La bodega sale de la sesión, nunca del formulario
    const { organization } = await getCurrentMember()
    await requirePermission({ organization: ['update'] })
    await updateSettings(db, organization.id, values)
  } catch (e) {
    if (isNextControlFlow(e)) throw e
    if (e instanceof ForbiddenError) return { ok: false, values, error: e.message }
    console.error('[configuracion] guardar precios en la caja falló', e)
    return { ok: false, values, error: GENERIC_ERROR }
  }

  revalidatePath('/configuracion')
  // La Caja lee el ajuste al cargar
  revalidatePath('/caja')
  return { ok: true, values, message: 'Ajustes guardados' }
}

const BUSINESS_FIELDS = [
  'tradeName',
  'legalName',
  'ruc',
  'address',
  'phone',
  'branchName',
  'receiptFooter',
] as const

export type BusinessProfileState = {
  ok: boolean
  message?: string
  error?: string
  fieldErrors?: Record<string, string[] | undefined>
  /** Valores crudos para repoblar el formulario tras un error. */
  values?: Record<(typeof BUSINESS_FIELDS)[number], string>
}

/** Guarda los datos del negocio (boleta y menú). Exige `organization:update`. */
export async function updateBusinessProfileAction(
  _prev: BusinessProfileState,
  formData: FormData,
): Promise<BusinessProfileState> {
  const values = Object.fromEntries(
    BUSINESS_FIELDS.map((k) => [k, text(formData, k)]),
  ) as NonNullable<BusinessProfileState['values']>
  const parsed = businessProfileSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, values, fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  try {
    // La bodega sale de la sesión, nunca del formulario
    const { organization } = await getCurrentMember()
    await requirePermission({ organization: ['update'] })
    await updateBusinessProfile(db, { orgId: organization.id, input: parsed.data })
  } catch (e) {
    if (isNextControlFlow(e)) throw e
    if (e instanceof ForbiddenError) return { ok: false, values, error: e.message }
    console.error('[configuracion] guardar datos del negocio falló', e)
    return { ok: false, values, error: GENERIC_ERROR }
  }

  // El nombre y la sucursal salen en el menú; caja y ventas arman la boleta con el perfil
  revalidatePath('/', 'layout')
  // La tienda muestra nombre comercial, dirección y el teléfono de WhatsApp
  await revalidateStore()
  return { ok: true, message: 'Datos del negocio guardados' }
}

export type StoreSettingsState = {
  ok: boolean
  message?: string
  error?: string
  fieldErrors?: Record<string, string[] | undefined>
  /** Valores crudos para repoblar el formulario tras un error. */
  values?: {
    storeEnabled: boolean
    hasWhatsapp: boolean
    metroDeliveryEnabled: boolean
    storeSlug: string
    storeHours: string
  }
}

/** Guarda la tienda online (pública, sin login). Exige `organization:update`. */
export async function updateStoreSettingsAction(
  _prev: StoreSettingsState,
  formData: FormData,
): Promise<StoreSettingsState> {
  const values = {
    storeEnabled: formData.get('storeEnabled') !== null,
    hasWhatsapp: formData.get('hasWhatsapp') !== null,
    metroDeliveryEnabled: formData.get('metroDeliveryEnabled') !== null,
    storeSlug: text(formData, 'storeSlug'),
    storeHours: text(formData, 'storeHours'),
  }
  const parsed = storeSettingsSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, values, fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  try {
    // La bodega sale de la sesión, nunca del formulario
    const { organization } = await getCurrentMember()
    await requirePermission({ organization: ['update'] })
    const res = await updateStoreSettings(db, organization.id, parsed.data)
    if (!res.ok) {
      return { ok: false, values, fieldErrors: { storeSlug: ['Esa dirección ya está en uso'] } }
    }
  } catch (e) {
    if (isNextControlFlow(e)) throw e
    if (e instanceof ForbiddenError) return { ok: false, values, error: e.message }
    console.error('[configuracion] guardar tienda online falló', e)
    return { ok: false, values, error: GENERIC_ERROR }
  }

  revalidatePath('/configuracion')
  // La tienda pública cachea por bodega (ver features/tienda/data/cached.ts)
  await revalidateStore()
  return { ok: true, message: 'Tienda guardada' }
}
