export type MovementType = 'ingreso' | 'ajuste' | 'venta' | 'anulacion'

export const MOVEMENT_TYPES = [
  'ingreso',
  'ajuste',
  'venta',
  'anulacion',
] as const satisfies readonly MovementType[]

export const MOVEMENT_LABELS = {
  ingreso: 'Ingreso',
  ajuste: 'Ajuste',
  venta: 'Venta',
  anulacion: 'Anulación',
} as const satisfies Record<MovementType, string>

/** "+5" / "-3" (con signo explícito). */
export const signed = (n: number) => (n > 0 ? `+${n}` : String(n))
