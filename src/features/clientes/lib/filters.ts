import { z } from 'zod'

export const PAGE_SIZE = 50
/** Tope de filas del CSV de clientes. */
export const EXPORT_LIMIT = 5000
export const MAX_QUERY = 80

export type CustomersFilters = {
  query: string
  includeInactive: boolean
}

// Un valor inválido en la URL se descarta (como si no estuviera) en vez de romper la página.
const optional = <T extends z.ZodType>(schema: T) => schema.optional().catch(undefined)

/** Parámetros de la URL, compartidos por la página y el exportador CSV. */
export const customersSearchParamsSchema = z.object({
  q: optional(z.string().trim().max(MAX_QUERY)),
  inactivos: optional(z.literal('1')),
  pagina: optional(z.coerce.number().int().min(1).max(100_000)),
})

type RawParams = Record<string, string | string[] | undefined>

/**
 * `canSeeInactive` = quien puede desactivar/reactivar: para el resto el filtro "inactivos" se
 * ignora aunque venga en la URL.
 */
export function parseCustomersSearchParams(
  raw: RawParams,
  canSeeInactive: boolean,
): { filters: CustomersFilters; page: number } {
  // Si un parámetro viene repetido (?a=1&a=2) se usa el primero
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  )
  const p = customersSearchParamsSchema.parse(flat)
  return {
    filters: { query: p.q ?? '', includeInactive: canSeeInactive && p.inactivos === '1' },
    page: p.pagina ?? 1,
  }
}

/** Query string (sin `?`) de los filtros, para el enlace del CSV. */
export function customersQueryString(filters: CustomersFilters): string {
  const params = new URLSearchParams()
  if (filters.query) params.set('q', filters.query)
  if (filters.includeInactive) params.set('inactivos', '1')
  return params.toString()
}

export function exportFileName(today: string): string {
  return `clientes-${today}.csv`
}
