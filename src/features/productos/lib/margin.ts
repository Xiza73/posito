export type Margin = {
  /** precio − costo, en céntimos (negativo = se vende bajo el costo). */
  cents: number
  /** Porcentaje del PRECIO, redondeado a entero; null si el precio es 0. */
  percent: number | null
  /** Costo >= precio: margen cero o negativo. */
  warning: boolean
}

/** Margen = precio − costo y % sobre el precio. Aritmética entera; sin costo -> null. */
export function computeMargin(priceCents: number, costCents: number | null): Margin | null {
  if (costCents === null || !Number.isInteger(costCents) || !Number.isInteger(priceCents)) {
    return null
  }
  const cents = priceCents - costCents
  const percent = priceCents > 0 ? Math.round((cents * 100) / priceCents) : null
  return { cents, percent, warning: cents <= 0 }
}

/** "Margen 40 %" (negativo: "Margen -25 %"); precio 0 -> "Margen —"; sin costo -> "—". */
export function formatMargin(margin: Margin | null): string {
  if (!margin) return '—'
  return margin.percent === null ? 'Margen —' : `Margen ${margin.percent} %`
}
