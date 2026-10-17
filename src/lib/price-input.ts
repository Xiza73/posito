// Precio tal como lo escribe el usuario <-> céntimos enteros. Compartido por Productos y la Caja
// (precio editado), por eso vive en lib/ y no en una feature.

/**
 * Convierte el precio tal como lo escribe el usuario a céntimos enteros, sin floats.
 * Acepta "3", "3.5", "3,50", "0.10". Rechaza (null): vacío, negativos, más de 2 decimales,
 * separadores de miles ("1,248.50" es ambiguo con la coma decimal), notación científica y NaN.
 * Hasta 6 dígitos enteros (S/ 999999.99): cabe de sobra en integer (32 bits) de Postgres.
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
