/** Mismos valores que el enum `payment_method` de la DB. */
export const PAYMENT_METHODS = ['efectivo', 'yape_plin', 'tarjeta'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  efectivo: 'Efectivo',
  yape_plin: 'Yape / Plin',
  tarjeta: 'Tarjeta',
}
