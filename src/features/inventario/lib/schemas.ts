import { z } from 'zod'

/** Tope de líneas de un ingreso en lote. */
export const MAX_BATCH_LINES = 200
/** Tope por operación (y por línea): evita desbordar la columna integer del stock. */
export const MAX_QUANTITY = 1_000_000
export const NOTE_MAX = 200
export const OTHER_MIN = 5
export const OTHER_MAX = 200

export const ADJUST_REASONS = {
  merma: 'Merma',
  vencido: 'Vencido',
  robo: 'Robo o pérdida',
  error_registro: 'Error de registro',
  otro: 'Otro',
} as const

export type AdjustReasonCode = keyof typeof ADJUST_REASONS
export const ADJUST_REASON_CODES = Object.keys(ADJUST_REASONS) as [
  AdjustReasonCode,
  ...AdjustReasonCode[],
]

/** Motivo fijo de los movimientos que genera un conteo físico. */
export const COUNT_REASON = 'Conteo físico'

/** Entero en texto (viene de un formulario). El mensaje se reutiliza para vacío y no numérico. */
const wholeNumber = (label: string, min: number) =>
  z
    .string({ error: `Ingresa ${label}` })
    .trim()
    .regex(/^\d{1,9}$/, { error: `Ingresa ${label} (número entero)` })
    .transform(Number)
    .pipe(
      z
        .number()
        .min(min, { error: min === 0 ? `Ingresa ${label}` : `${label} debe ser mayor que 0` })
        .max(MAX_QUANTITY, { error: `El máximo es ${MAX_QUANTITY.toLocaleString('es-PE')}` }),
    )

/** Nota opcional: vacía = null. */
const note = z
  .string()
  .trim()
  .max(NOTE_MAX, { error: `Máximo ${NOTE_MAX} caracteres` })
  .default('')
  .transform((v) => (v === '' ? null : v))

const productId = z.uuid({ error: 'Producto no válido' })

/** "Ingresar" de un solo producto. Produce una línea para `registerIngreso`. */
export const ingresoInputSchema = z
  .object({
    productId,
    quantity: wholeNumber('la cantidad', 1),
    note,
  })
  .transform(({ productId, quantity, note }) => ({
    lines: [{ productId, quantity }],
    note,
  }))

/** Ingreso en lote: las líneas llegan como JSON; el servidor las une si se repite el producto. */
export const batchIngresoInputSchema = z.object({
  lines: z
    .array(
      z.object({
        productId,
        quantity: z.number().int().min(1).max(MAX_QUANTITY),
      }),
      { error: 'Agrega al menos un producto' },
    )
    .min(1, { error: 'Agrega al menos un producto' })
    .max(MAX_BATCH_LINES, { error: `Máximo ${MAX_BATCH_LINES} productos por ingreso` }),
  note,
})

/**
 * "Ajustar": sumar o restar N con un motivo de la lista. El motivo guardado es el texto de la opción
 * o, para "Otro", `Otro: <texto>`. El servidor no confía en el cliente para el texto del motivo.
 */
export const adjustInputSchema = z
  .object({
    productId,
    direction: z.enum(['sumar', 'restar'], { error: 'Elige si sumas o restas' }),
    quantity: wholeNumber('la cantidad', 1),
    reasonCode: z.enum(ADJUST_REASON_CODES, { error: 'Elige un motivo' }),
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
  .transform(({ productId, direction, quantity, reasonCode, otherText }) => ({
    productId,
    delta: direction === 'sumar' ? quantity : -quantity,
    reason: reasonCode === 'otro' ? `Otro: ${otherText}` : ADJUST_REASONS[reasonCode],
  }))

/** "Contar": cantidad contada (puede ser 0). El servidor calcula la diferencia con el stock real. */
export const countInputSchema = z.object({
  productId,
  counted: wholeNumber('la cantidad contada', 0),
  note,
})

export type AdjustInput = z.output<typeof adjustInputSchema>
