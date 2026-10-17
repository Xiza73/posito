import { z } from 'zod'
import { normalizeDocument, validateDocument } from '@/lib/document'
import { normalizeDisplayName } from '@/lib/name-key'
import { NO_CONTROL_MESSAGE, noControl } from '@/lib/text-guard'

export const receiptSeriesSchema = z.object({
  // Formato SUNAT de boleta; se normaliza a mayúsculas antes de validar
  series: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^B\d{3}$/, 'Usa el formato de boleta: B y 3 dígitos (ej. B001)'),
  nextNumber: z
    .string()
    .trim()
    .regex(/^\d{1,8}$/, 'Ingresa un número entero entre 1 y 99999999')
    .transform(Number)
    .pipe(z.int().min(1, 'El número mínimo es 1').max(99_999_999, 'El número máximo es 99999999')),
})

export type ReceiptSeriesInput = z.output<typeof receiptSeriesSchema>

/** Un checkbox sin marcar no viaja en el FormData: ausente = false. */
export const settingsSchema = z.object({
  requireSaleApproval: z.boolean(),
})

export type SettingsInput = z.output<typeof settingsSchema>

export const manualPriceSchema = z.object({
  allowManualPrice: z.boolean(),
})

export const BUSINESS_LIMITS = {
  tradeName: 80,
  legalName: 120,
  address: 200,
  phone: 30,
  branchName: 60,
  receiptFooter: 120,
} as const

/** Texto del formulario: sin caracteres de control/formato, espacios colapsados y límites de largo. */
const text = (label: string, min: number, max: number) =>
  z
    .string()
    .refine(noControl, NO_CONTROL_MESSAGE)
    .transform(normalizeDisplayName)
    .pipe(
      z
        .string()
        .max(max, `${label} no puede pasar de ${max} caracteres`)
        .refine((v) => v.length >= min, `${label} debe tener al menos ${min} caracteres`),
    )

/** Opcional: vacío o ausente = null (si trae algo, aplica el mínimo). */
const optionalText = (label: string, max: number, min = 0) =>
  text(label, 0, max)
    .refine((v) => v === '' || v.length >= min, `${label} debe tener al menos ${min} caracteres`)
    .optional()
    .transform((v) => (v ? v : null))

export const businessProfileSchema = z
  .object({
    tradeName: text('El nombre comercial', 2, BUSINESS_LIMITS.tradeName),
    legalName: optionalText('La razón social', BUSINESS_LIMITS.legalName, 2),
    ruc: optionalText('El RUC', 20),
    address: optionalText('La dirección', BUSINESS_LIMITS.address),
    phone: optionalText('El teléfono', BUSINESS_LIMITS.phone),
    branchName: optionalText('La sucursal', BUSINESS_LIMITS.branchName),
    receiptFooter: optionalText('El mensaje final', BUSINESS_LIMITS.receiptFooter),
  })
  .superRefine((v, ctx) => {
    if (!v.ruc) return
    const error = validateDocument('ruc', v.ruc)
    if (error) ctx.addIssue({ code: 'custom', path: ['ruc'], message: error })
    if (!v.legalName) {
      ctx.addIssue({
        code: 'custom',
        path: ['legalName'],
        message: 'La razón social es obligatoria si ingresas un RUC',
      })
    }
  })
  // Normalizado (sin espacios ni guiones): es lo que se guarda y se imprime
  .transform((v) => ({ ...v, ruc: v.ruc ? normalizeDocument(v.ruc) : null }))

export type BusinessProfileFormInput = z.output<typeof businessProfileSchema>
