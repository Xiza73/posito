import { z } from 'zod'
import { addDays, isValidDateString, todayInLima } from '@/lib/lima-time'
import { PAYMENT_METHODS } from '@/lib/payment'

export const PAGE_SIZE = 50
/** Tope de filas del CSV: más allá se pide acotar el rango. */
export const EXPORT_LIMIT = 5000
/** Una venta solo se puede anular dentro de esta ventana (se valida en la DB con now()). */
export const VOID_WINDOW_DAYS = 7
/** Rango máximo de fechas consultable. */
export const MAX_RANGE_DAYS = 366

export const SALE_STATUSES = ['completada', 'anulada'] as const

export type SalesFilters = {
  /** `YYYY-MM-DD` en hora de Lima, inclusive. */
  from: string
  to: string
  paymentMethod?: (typeof PAYMENT_METHODS)[number]
  status?: (typeof SALE_STATUSES)[number]
  cashierId?: string
  productId?: string
  /** "B001-00038" o solo el número. */
  receipt?: string
}

// Un valor inválido en la URL se descarta (como si no estuviera) en vez de romper la página.
const optional = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined)
// Años acotados: 9999-12-31 + 1 día desborda el formato y rompía la página con un 500
const date = z
  .string()
  .refine(isValidDateString)
  .refine((d) => d >= '2000-01-01' && d <= '2100-12-31')

/** Parámetros de la URL, compartidos por la página y el exportador CSV. */
export const salesSearchParamsSchema = z.object({
  desde: optional(date),
  hasta: optional(date),
  metodo: optional(z.enum(PAYMENT_METHODS)),
  estado: optional(z.enum(SALE_STATUSES)),
  cajero: optional(z.string().min(1).max(64)),
  producto: optional(z.uuid()),
  boleta: optional(z.string().trim().min(1).max(20)),
  pagina: optional(z.coerce.number().int().min(1).max(100_000)),
})

type RawParams = Record<string, string | string[] | undefined>

export function parseSalesSearchParams(
  raw: RawParams,
  now: Date = new Date(),
): { filters: SalesFilters; page: number } {
  // Si un parámetro viene repetido (?a=1&a=2) se usa el primero
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  )
  const p = salesSearchParamsSchema.parse(flat)

  const today = todayInLima(now)
  let from = p.desde ?? today
  let to = p.hasta ?? today
  // Rango al revés: se interpreta como el mismo rango en orden
  if (from > to) [from, to] = [to, from]
  // Rango máximo de un año: acota el costo de la página y del CSV
  const minFrom = addDays(to, -(MAX_RANGE_DAYS - 1))
  if (from < minFrom) from = minFrom

  return {
    filters: {
      from,
      to,
      paymentMethod: p.metodo,
      status: p.estado,
      cashierId: p.cajero,
      productId: p.producto,
      receipt: p.boleta,
    },
    page: p.pagina ?? 1,
  }
}

/** Query string (sin `?`) de los filtros, para enlaces (CSV, paginación). */
export function salesQueryString(filters: SalesFilters, page?: number): string {
  const params = new URLSearchParams({ desde: filters.from, hasta: filters.to })
  if (filters.paymentMethod) params.set('metodo', filters.paymentMethod)
  if (filters.status) params.set('estado', filters.status)
  if (filters.cashierId) params.set('cajero', filters.cashierId)
  if (filters.productId) params.set('producto', filters.productId)
  if (filters.receipt) params.set('boleta', filters.receipt)
  if (page && page > 1) params.set('pagina', String(page))
  return params.toString()
}

/** Nombre del archivo CSV: ventas-YYYY-MM-DD_YYYY-MM-DD.csv */
export function exportFileName(filters: Pick<SalesFilters, 'from' | 'to'>): string {
  return `ventas-${filters.from}_${filters.to}.csv`
}

/** Atajos de rango del selector de fechas ("Hoy", "7 días", "Mes"). */
export function quickRanges(today: string) {
  return [
    { key: 'hoy', label: 'Hoy', from: today, to: today },
    { key: '7d', label: '7 días', from: addDays(today, -6), to: today },
    { key: 'mes', label: 'Este mes', from: `${today.slice(0, 8)}01`, to: today },
  ] as const
}
