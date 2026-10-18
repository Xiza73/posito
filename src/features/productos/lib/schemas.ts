import { z } from 'zod'
import { centsToPriceInput, parsePriceToCents } from '@/lib/price-input'
import { type PriceTier, validateTiers } from '@/lib/pricing'

// Reexportados: el formulario y los tests de Productos los importan de aquí
export { centsToPriceInput, parsePriceToCents }

const MAX_INT_DIGITS = 6 // hasta S/ 999999.99: cabe de sobra en integer (32 bits) de Postgres

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

/** Fila del formulario de "Precio por mayor", tal como la escribe el usuario. */
export type TierRow = { minQty: string; price: string }

/**
 * Convierte las filas del formulario a niveles. Las filas totalmente vacías se ignoran; una a medias
 * es error. NO compara contra el precio normal (eso es `validateTiers`, que necesita el precio).
 */
export function parseTierRows(rows: readonly TierRow[]): { tiers: PriceTier[]; errors: string[] } {
  const tiers: PriceTier[] = []
  const errors: string[] = []
  rows.forEach((r, i) => {
    const minQtyText = r.minQty.trim()
    const priceText = r.price.trim()
    if (minQtyText === '' && priceText === '') return
    const minQty = /^\d{1,4}$/.test(minQtyText) ? Number(minQtyText) : null
    const unitPriceCents = parsePriceToCents(priceText)
    if (minQty === null || unitPriceCents === null) {
      errors.push(`Nivel ${i + 1}: completa "Desde" (entero) y un precio válido (ej. 2.50)`)
      return
    }
    tiers.push({ minQty, unitPriceCents })
  })
  return { tiers, errors }
}

const tiersField = z
  .array(z.object({ minQty: z.string().max(10), price: z.string().max(20) }))
  .max(20)
  // Ausente (p. ej. la importación masiva, que no maneja niveles) = sin niveles
  .default([])
  .transform((rows, ctx) => {
    const { tiers, errors } = parseTierRows(rows)
    for (const message of errors) ctx.addIssue({ code: 'custom', message })
    return errors.length > 0 ? z.NEVER : tiers
  })

export const productInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(80, 'El nombre no puede pasar de 80 caracteres'),
    barcode,
    priceCents: price,
    categoryName,
    tracksStock: z.boolean(),
    showInStore: z.boolean().default(true),
    initialStock: count('El stock inicial debe ser un número entero'),
    minStock: count('El stock mínimo debe ser un número entero'),
    tiers: tiersField,
  })
  .superRefine((d, ctx) => {
    // Misma regla en cliente y servidor (src/lib/pricing.ts): el servidor nunca confía en el formulario
    for (const message of validateTiers(d.priceCents, d.tiers)) {
      ctx.addIssue({ code: 'custom', path: ['tiers'], message })
    }
  })

/**
 * Entrada de escritura de un producto. `tiers` es opcional en la capa de datos: ausente = no tocar
 * los niveles (p. ej. otros flujos); presente = reemplazarlos TODOS (vacío = quitar el precio por mayor).
 */
export type ProductInput = Omit<z.infer<typeof productInputSchema>, 'tiers' | 'showInStore'> & {
  tiers?: PriceTier[]
  /** Ausente = visible en la tienda al crear / no tocar al editar. */
  showInStore?: boolean
}

export const idSchema = z.uuid('Elemento no válido')
