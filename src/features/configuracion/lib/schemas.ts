import { z } from 'zod'

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
