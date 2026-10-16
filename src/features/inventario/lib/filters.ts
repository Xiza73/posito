import { z } from 'zod'
import { addDays, isValidDateString, todayInLima } from '@/lib/lima-time'
import { MOVEMENT_TYPES, type MovementType } from './labels'

export const PAGE_SIZE = 50
/** Rango máximo de fechas del historial. */
export const MAX_RANGE_DAYS = 366
/** Por defecto el historial muestra los últimos 7 días (hoy incluido). */
export const DEFAULT_RANGE_DAYS = 7

type RawParams = Record<string, string | string[] | undefined>

// Un valor inválido en la URL se descarta (como si no estuviera) en vez de romper la página.
const optional = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined)
// Años acotados: 9999-12-31 + 1 día desborda el formato y rompía la página con un 500
const date = z
  .string()
  .refine(isValidDateString)
  .refine((d) => d >= '2000-01-01' && d <= '2100-12-31')

// Si un parámetro viene repetido (?a=1&a=2) se usa el primero
const flatten = (raw: RawParams) =>
  Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]))

// --- Stock ---

export const STOCK_STATUS_FILTERS = ['bajo', 'agotado'] as const
export type StockStatusFilter = (typeof STOCK_STATUS_FILTERS)[number]

export type StockFilters = {
  query: string
  categoryId?: string
  /** Solo productos que controlan stock. Sin valor = todos. */
  status?: StockStatusFilter
  includeInactive: boolean
}

const stockParamsSchema = z.object({
  q: optional(z.string().trim().max(80)),
  categoria: optional(z.uuid()),
  estado: optional(z.enum(STOCK_STATUS_FILTERS)),
  inactivos: optional(z.literal('1')),
})

/** `canSeeInactive`: ver inactivos solo tiene sentido para quien puede gestionarlos (stock:adjust). */
export function parseStockSearchParams(raw: RawParams, canSeeInactive: boolean): StockFilters {
  const p = stockParamsSchema.parse(flatten(raw))
  return {
    query: p.q ?? '',
    categoryId: p.categoria,
    status: p.estado,
    includeInactive: canSeeInactive && p.inactivos === '1',
  }
}

/** Query string (sin `?`) de los filtros de stock, para el enlace del CSV. */
export function stockQueryString(filters: StockFilters): string {
  const params = new URLSearchParams()
  if (filters.query) params.set('q', filters.query)
  if (filters.categoryId) params.set('categoria', filters.categoryId)
  if (filters.status) params.set('estado', filters.status)
  if (filters.includeInactive) params.set('inactivos', '1')
  return params.toString()
}

/** Nombre del archivo CSV: inventario-YYYY-MM-DD.csv (fecha de hoy en Lima). */
export const stockExportFileName = (today: string) => `inventario-${today}.csv`

// --- Movimientos ---

export type MovementFilters = {
  /** `YYYY-MM-DD` en hora de Lima, inclusive. */
  from: string
  to: string
  type?: MovementType
  userId?: string
  productId?: string
}

const movementParamsSchema = z.object({
  desde: optional(date),
  hasta: optional(date),
  tipo: optional(z.enum(MOVEMENT_TYPES)),
  usuario: optional(z.string().min(1).max(64)),
  producto: optional(z.uuid()),
  pagina: optional(z.coerce.number().int().min(1).max(100_000)),
})

export function parseMovementSearchParams(
  raw: RawParams,
  now: Date = new Date(),
): { filters: MovementFilters; page: number } {
  const p = movementParamsSchema.parse(flatten(raw))

  const today = todayInLima(now)
  let from = p.desde ?? addDays(p.hasta ?? today, -(DEFAULT_RANGE_DAYS - 1))
  let to = p.hasta ?? today
  // Rango al revés: se interpreta como el mismo rango en orden
  if (from > to) [from, to] = [to, from]
  // Rango máximo de un año: acota el costo de la página
  const minFrom = addDays(to, -(MAX_RANGE_DAYS - 1))
  if (from < minFrom) from = minFrom

  return {
    filters: { from, to, type: p.tipo, userId: p.usuario, productId: p.producto },
    page: p.pagina ?? 1,
  }
}

/** Query string (sin `?`) de los filtros de movimientos, para enlaces. */
export function movementQueryString(filters: MovementFilters, page?: number): string {
  const params = new URLSearchParams({ desde: filters.from, hasta: filters.to })
  if (filters.type) params.set('tipo', filters.type)
  if (filters.userId) params.set('usuario', filters.userId)
  if (filters.productId) params.set('producto', filters.productId)
  if (page && page > 1) params.set('pagina', String(page))
  return params.toString()
}

/** Atajos de rango del selector de fechas. */
export function quickRanges(today: string) {
  return [
    { key: 'hoy', label: 'Hoy', from: today, to: today },
    { key: '7d', label: '7 días', from: addDays(today, -(DEFAULT_RANGE_DAYS - 1)), to: today },
    { key: 'mes', label: 'Este mes', from: `${today.slice(0, 8)}01`, to: today },
  ] as const
}
