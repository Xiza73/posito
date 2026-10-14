import { z } from 'zod'

const MAX_INT_DIGITS = 6 // hasta S/ 999999.99: cabe de sobra en integer (32 bits) de Postgres

/**
 * Convierte el precio tal como lo escribe el usuario a céntimos enteros, sin floats.
 * Acepta "3", "3.5", "3,50", "0.10". Rechaza (null): vacío, negativos, más de 2 decimales,
 * separadores de miles ("1,248.50" es ambiguo con la coma decimal), notación científica y NaN.
 */
export function parsePriceToCents(input: string): number | null {
  const match = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(input.trim())
  if (!match) return null
  const [, whole, frac = ''] = match
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}

/** Inverso para repoblar el formulario: 350 -> "3.50". Solo aritmética entera. */
export function centsToPriceInput(cents: number): string {
  const whole = Math.trunc(cents / 100)
  const frac = String(cents % 100).padStart(2, '0')
  return `${whole}.${frac}`
}

export const categoryNameSchema = z
  .string()
  .trim()
  .min(2, 'El nombre debe tener al menos 2 caracteres')
  .max(40, 'El nombre no puede pasar de 40 caracteres')

const price = z.string().transform((value, ctx) => {
  const cents = parsePriceToCents(value)
  if (cents === null) {
    ctx.addIssue({
      code: 'custom',
      message: `Ingresa un precio válido, hasta ${MAX_INT_DIGITS} dígitos y 2 decimales (ej. 3.50)`,
    })
    return z.NEVER
  }
  return cents
})

/** Entero >= 0 escrito en un input de texto; vacío = 0. */
const count = (message: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? '0' : v))
    .pipe(z.string().regex(/^\d{1,7}$/, message))
    .transform(Number)

const barcode = z
  .string()
  .trim()
  .max(40, 'El código no puede pasar de 40 caracteres')
  .regex(/^[A-Za-z0-9]*$/, 'El código solo puede tener letras y números')
  .transform((v) => (v === '' ? null : v))

// Texto libre del combobox: vacío = sin categoría. Si no existe en la bodega, se crea.
const categoryName = z
  .string()
  .trim()
  .max(40, 'La categoría no puede pasar de 40 caracteres')
  .refine((v) => v === '' || v.length >= 2, 'La categoría debe tener al menos 2 caracteres')
  .transform((v) => (v === '' ? null : v))

export const productInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(80, 'El nombre no puede pasar de 80 caracteres'),
  barcode,
  priceCents: price,
  categoryName,
  tracksStock: z.boolean(),
  initialStock: count('El stock inicial debe ser un número entero'),
  minStock: count('El stock mínimo debe ser un número entero'),
})

export type ProductInput = z.infer<typeof productInputSchema>

export const idSchema = z.uuid('Elemento no válido')
