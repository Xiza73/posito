const pen = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
})

/** Formatea soles: 9.1 -> "S/ 9.10" (con espacio duro tras "S/"). */
export function formatPEN(amount: number): string {
  return pen.format(amount)
}

/** Formatea un monto expresado en céntimos enteros. */
export function formatCents(cents: number): string {
  return formatPEN(cents / 100)
}
