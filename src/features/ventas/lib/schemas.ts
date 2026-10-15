import { z } from 'zod'

export const VOID_REASONS = {
  error_cobro: 'Error de cobro',
  devolucion: 'Cliente devolvió los productos',
  producto_equivocado: 'Producto equivocado',
  otro: 'Otro',
} as const

export type VoidReasonCode = keyof typeof VOID_REASONS
export const VOID_REASON_CODES = Object.keys(VOID_REASONS) as [VoidReasonCode, ...VoidReasonCode[]]

export const OTHER_MIN = 5
export const OTHER_MAX = 200

/**
 * Entrada de "Anular venta". Produce `{ id, reason }`: el motivo guardado es el texto de la opción
 * o, para "Otro", `Otro: <texto>`. El servidor no confía en el cliente para el texto del motivo.
 */
export const voidInputSchema = z
  .object({
    id: z.uuid(),
    reasonCode: z.enum(VOID_REASON_CODES, { error: 'Elige un motivo' }),
    otherText: z.string().trim().default(''),
  })
  .superRefine((v, ctx) => {
    if (v.reasonCode !== 'otro') return
    if (v.otherText.length < OTHER_MIN || v.otherText.length > OTHER_MAX) {
      ctx.addIssue({
        code: 'custom',
        path: ['otherText'],
        message: `Describe el motivo (entre ${OTHER_MIN} y ${OTHER_MAX} caracteres)`,
      })
    }
  })
  .transform(({ id, reasonCode, otherText }) => ({
    id,
    reason: reasonCode === 'otro' ? `Otro: ${otherText}` : VOID_REASONS[reasonCode],
  }))

export type VoidInput = z.output<typeof voidInputSchema>
