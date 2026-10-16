import { z } from 'zod'
import { DOCUMENT_TYPES, type DocumentType, normalizeDocument, validateDocument } from './document'
import { NO_CONTROL_MESSAGE, noControl } from './text-guard'

// Esquema de alta/edición de clientes, compartido por Clientes y el alta rápida de la Caja.
// Módulo puro (sin servidor): lo usan Server Actions y componentes. El servidor SIEMPRE re-valida.

export const MAX_NAME = 80

/** Cliente tal como lo ve el selector de la Caja y las listas (serializable). */
export type CustomerOption = {
  id: string
  name: string
  documentType: DocumentType | null
  documentNumber: string | null
  phone: string | null
}

export const DUPLICATE_DOCUMENT_MESSAGE = 'Ya existe un cliente con ese documento'

/** Texto opcional: vacío o ausente = null. */
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} no puede pasar de ${max} caracteres`)
    .refine(noControl, NO_CONTROL_MESSAGE)
    .optional()
    .transform((v) => (v ? v : null))

const phone = z
  .string()
  .trim()
  .max(20, 'El teléfono no puede pasar de 20 caracteres')
  .refine(noControl, NO_CONTROL_MESSAGE)
  .regex(/^[\d+()\s-]{6,20}$/, 'Ingresa un teléfono válido (solo números, +, espacios o guiones)')
  .transform((v) => v.replace(/\s+/g, ' '))
  .or(z.literal(''))
  .optional()
  .transform((v) => (v ? v : null))

const email = z
  .string()
  .trim()
  .max(120, 'El correo no puede pasar de 120 caracteres')
  .refine(noControl, NO_CONTROL_MESSAGE)
  .refine((v) => v === '' || z.email().safeParse(v).success, 'Ingresa un correo válido')
  .optional()
  .transform((v) => (v ? v.toLowerCase() : null))

const documentType = z
  .enum(DOCUMENT_TYPES)
  .or(z.literal(''))
  .optional()
  .transform((v) => (v ? v : null))

export const customerInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(MAX_NAME, `El nombre no puede pasar de ${MAX_NAME} caracteres`)
      .refine(noControl, NO_CONTROL_MESSAGE),
    documentType,
    documentNumber: optionalText(20, 'El documento'),
    phone,
    email,
    address: optionalText(160, 'La dirección'),
  })
  .superRefine((v, ctx) => {
    if (v.documentNumber && !v.documentType) {
      ctx.addIssue({
        code: 'custom',
        path: ['documentType'],
        message: 'Elige el tipo de documento',
      })
    } else if (v.documentType && !v.documentNumber) {
      ctx.addIssue({
        code: 'custom',
        path: ['documentNumber'],
        message: 'Ingresa el número de documento',
      })
    } else if (v.documentType && v.documentNumber) {
      const error = validateDocument(v.documentType, v.documentNumber)
      if (error) ctx.addIssue({ code: 'custom', path: ['documentNumber'], message: error })
    }
  })
  .transform((v) => ({
    ...v,
    // Normalizado (sin espacios ni guiones, en mayúsculas): es lo que se guarda y se compara
    documentNumber: v.documentNumber ? normalizeDocument(v.documentNumber) : null,
  }))

export type CustomerInput = z.output<typeof customerInputSchema>
