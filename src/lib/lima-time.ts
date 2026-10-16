// Fechas de negocio en hora de Lima. Perú es UTC-5 todo el año (sin horario de verano), pero el
// desfase se calcula con Intl y no se escribe a mano: si la zona cambiara, el código sigue bien.

export const LIMA_TZ = 'America/Lima'

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: LIMA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

type Wall = { y: number; m: number; d: number; h: number; min: number; s: number }

/** Reloj de pared de Lima para un instante. */
function wallClock(instant: Date): Wall {
  const get: Record<string, number> = {}
  for (const p of partsFormat.formatToParts(instant)) {
    if (p.type !== 'literal') get[p.type] = Number(p.value)
  }
  return { y: get.year, m: get.month, d: get.day, h: get.hour, min: get.minute, s: get.second }
}

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

/** `true` si es una fecha de calendario real `YYYY-MM-DD` (rechaza 2026-02-31). */
export function isValidDateString(value: string): boolean {
  const m = DATE_RE.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const probe = new Date(Date.UTC(y, mo - 1, d))
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d
}

/** Día de calendario de Lima (`YYYY-MM-DD`) en el que cae un instante. */
export function todayInLima(now: Date = new Date()): string {
  const w = wallClock(now)
  return `${pad(w.y, 4)}-${pad(w.m)}-${pad(w.d)}`
}

/** Suma (o resta) días a una fecha `YYYY-MM-DD`, en calendario puro. */
export function addDays(date: string, days: number): string {
  const m = DATE_RE.exec(date)
  if (!m) throw new Error(`Fecha inválida: ${date}`)
  const t = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days))
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** Instante UTC en que empieza (00:00 en Lima) el día `YYYY-MM-DD`. */
export function limaDayStart(date: string): Date {
  const m = DATE_RE.exec(date)
  if (!m) throw new Error(`Fecha inválida: ${date}`)
  const wallAsUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  // desfase = (reloj de pared de Lima leído como UTC) - (instante real); se afina una vez
  // por si el desfase en la hora candidata difiere del de la medianoche.
  let guess = wallAsUtc
  for (let i = 0; i < 2; i++) {
    const w = wallClock(new Date(guess))
    const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.h, w.min, w.s)
    guess -= asUtc - wallAsUtc
  }
  return new Date(guess)
}

/**
 * Rango de días de Lima, ambos inclusive, como instantes UTC `[start, end)`:
 * `start` = 00:00 de `from`; `end` = 00:00 del día siguiente a `to`.
 */
export function limaRangeToUtc(from: string, to: string): { start: Date; end: Date } {
  return { start: limaDayStart(from), end: limaDayStart(addDays(to, 1)) }
}

/** "2026-10-14 13:05" en hora de Lima (formato para exportar). */
export function formatLimaDateTime(iso: string | Date): string {
  const w = wallClock(typeof iso === 'string' ? new Date(iso) : iso)
  return `${pad(w.y, 4)}-${pad(w.m)}-${pad(w.d)} ${pad(w.h)}:${pad(w.min)}`
}
