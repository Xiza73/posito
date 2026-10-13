/** Tasa de IGV (Perú). Los precios de catálogo ya lo incluyen. */
export const IGV_RATE = 0.18

/** Todos los montos son enteros en céntimos para evitar errores de coma flotante. */
export type Line = {
  unitPriceCents: number
  qty: number
}

export function lineTotalCents(line: Line): number {
  return line.unitPriceCents * line.qty
}

/** Total a cobrar (IGV incluido). */
export function totalCents(lines: readonly Line[]): number {
  return lines.reduce((acc, l) => acc + lineTotalCents(l), 0)
}

/** Base imponible: total / 1.18, redondeada al céntimo. */
export function subtotalCents(total: number): number {
  return Math.round(total / (1 + IGV_RATE))
}

/** IGV incluido en el total: total - total/1.18. Subtotal + IGV == total siempre. */
export function igvCents(total: number): number {
  return total - subtotalCents(total)
}

export function itemCount(lines: readonly Line[]): number {
  return lines.reduce((acc, l) => acc + l.qty, 0)
}

export type Totals = { subtotal: number; igv: number; total: number }

export function computeTotals(lines: readonly Line[]): Totals {
  const total = totalCents(lines)
  return { subtotal: subtotalCents(total), igv: igvCents(total), total }
}
