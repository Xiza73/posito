/** Serie por defecto de boletas (formato SUNAT: B + 3 dígitos). */
export const DEFAULT_RECEIPT_SERIES = 'B001'

/** B001 + 38 -> "B001-00038" (número a 5 dígitos como mínimo). */
export function formatReceiptNumber(series: string, number: number): string {
  return `${series}-${String(number).padStart(5, '0')}`
}
