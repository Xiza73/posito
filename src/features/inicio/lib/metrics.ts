/** Ticket promedio en céntimos enteros; 0 si no hay ventas (nunca divide por cero). */
export function averageTicket(totalCents: number, count: number): number {
  return count > 0 ? Math.round(totalCents / count) : 0
}

/**
 * Variación porcentual (entera) de `curr` respecto a `prev`. `null` si `prev` es 0: no hay base de
 * comparación (la UI muestra "—"). Con base negativa se divide por su valor absoluto.
 */
export function percentChange(curr: number, prev: number): number | null {
  if (prev === 0) return null
  // `+ 0` normaliza -0 a 0
  return Math.round(((curr - prev) / Math.abs(prev)) * 100) + 0
}

/** Participación entera (0-100) de `part` en `total`; 0 si no hay total. */
export function sharePercent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0
}

export type Bucket = { key: string; label: string; cents: number; count: number }
type Row = { cents: number; count: number }

/** Las 24 horas de Lima (0-23), con ceros donde no hubo ventas. Horas fuera de rango se ignoran. */
export function fillHours(rows: (Row & { hour: number })[]): Bucket[] {
  const byHour = new Map(rows.map((r) => [r.hour, r]))
  return Array.from({ length: 24 }, (_, h) => ({
    key: String(h),
    label: `${String(h).padStart(2, '0')}h`,
    cents: byHour.get(h)?.cents ?? 0,
    count: byHour.get(h)?.count ?? 0,
  }))
}

const WEEKDAYS = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá']

/** "Lu 12" para una fecha `YYYY-MM-DD` (calendario puro, sin zona horaria). */
export function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${weekday} ${d}`
}

/** Un bucket por día de la lista (en orden), con ceros donde no hubo ventas. */
export function fillDays(days: string[], rows: (Row & { day: string })[]): Bucket[] {
  const byDay = new Map(rows.map((r) => [r.day, r]))
  return days.map((day) => ({
    key: day,
    label: dayLabel(day),
    cents: byDay.get(day)?.cents ?? 0,
    count: byDay.get(day)?.count ?? 0,
  }))
}
