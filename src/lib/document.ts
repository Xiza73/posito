// Documentos de identidad de clientes (DNI, RUC, carné de extranjería). Validación SOLO local, sin
// consultar a RENIEC/SUNAT. Módulo puro compartido por Clientes y el alta rápida de la Caja.

/** Mismos valores que el enum `document_type` de la DB. */
export const DOCUMENT_TYPES = ['dni', 'ruc', 'ce'] as const
export type DocumentType = (typeof DOCUMENT_TYPES)[number]

/** Etiqueta corta (boleta, tablas, CSV). */
export const DOCUMENT_LABELS: Record<DocumentType, string> = { dni: 'DNI', ruc: 'RUC', ce: 'CE' }

/** Prefijos válidos de un RUC: 10 persona natural, 15-17 otros, 20 persona jurídica. */
const RUC_PREFIXES = ['10', '15', '16', '17', '20']
const RUC_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

/** Quita espacios y guiones y pasa a mayúsculas: " 20100047-218 " -> "20100047218". */
export function normalizeDocument(input: string): string {
  return input.replace(/[\s-]+/g, '').toUpperCase()
}

/** RUC de 11 dígitos con prefijo válido y dígito verificador SUNAT (módulo 11). */
export function isValidRuc(input: string): boolean {
  const ruc = normalizeDocument(input)
  if (!/^\d{11}$/.test(ruc)) return false
  if (!RUC_PREFIXES.includes(ruc.slice(0, 2))) return false
  const sum = RUC_WEIGHTS.reduce((acc, w, i) => acc + w * Number(ruc[i]), 0)
  const remainder = 11 - (sum % 11)
  const check = remainder === 10 ? 0 : remainder === 11 ? 1 : remainder
  return check === Number(ruc[10])
}

/**
 * Mensaje de error en español (apto para mostrar) o null si el número es válido para ese tipo.
 * Acepta el texto crudo del usuario: lo normaliza antes de validar.
 */
export function validateDocument(type: DocumentType, number: string): string | null {
  const value = normalizeDocument(number)
  switch (type) {
    case 'dni':
      return /^\d{8}$/.test(value) ? null : 'El DNI debe tener 8 dígitos'
    case 'ce':
      return /^[A-Z0-9]{9,12}$/.test(value)
        ? null
        : 'El carné de extranjería debe tener entre 9 y 12 letras o números'
    case 'ruc':
      if (!/^\d{11}$/.test(value)) return 'El RUC debe tener 11 dígitos'
      if (!RUC_PREFIXES.includes(value.slice(0, 2))) {
        return 'El RUC debe empezar con 10, 15, 16, 17 o 20'
      }
      return isValidRuc(value) ? null : 'El RUC no es válido: revisa los dígitos'
  }
}

/** "DNI 12345678"; para la boleta y las listas. */
export function formatDocument(type: DocumentType, number: string): string {
  return `${DOCUMENT_LABELS[type]} ${number}`
}
