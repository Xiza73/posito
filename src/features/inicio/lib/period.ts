import { z } from 'zod'
import { addDays, limaRangeToUtc, todayInLima } from '@/lib/lima-time'

export const PERIODS = ['hoy', 'ayer', '7d'] as const
export type Period = (typeof PERIODS)[number]

export const PERIOD_LABELS: Record<Period, string> = {
  hoy: 'Hoy',
  ayer: 'Ayer',
  '7d': '7 días',
}

/** Texto de la comparación: "vs. ayer a esta hora", etc. */
export const PREVIOUS_LABELS: Record<Period, string> = {
  hoy: 'vs. ayer a esta hora',
  ayer: 'vs. anteayer',
  '7d': 'vs. los 7 días previos (mismo avance)',
}

// Un valor inválido en la URL cae en "hoy" en vez de romper la página.
const periodSchema = z.enum(PERIODS).catch('hoy')

export function parsePeriod(raw: string | string[] | undefined): Period {
  return periodSchema.parse(Array.isArray(raw) ? raw[0] : raw)
}

/** Rango de días de Lima (`YYYY-MM-DD`), ambos inclusive. */
export type DayRange = { from: string; to: string }

/**
 * Rango del período y del período equivalente anterior (misma cantidad de días, contiguo):
 * hoy vs ayer, ayer vs anteayer, 7 días vs los 7 días previos.
 */
export function periodRanges(
  period: Period,
  today: string,
): { current: DayRange; previous: DayRange } {
  switch (period) {
    case 'hoy':
      return {
        current: { from: today, to: today },
        previous: { from: addDays(today, -1), to: addDays(today, -1) },
      }
    case 'ayer':
      return {
        current: { from: addDays(today, -1), to: addDays(today, -1) },
        previous: { from: addDays(today, -2), to: addDays(today, -2) },
      }
    case '7d':
      return {
        current: { from: addDays(today, -6), to: today },
        previous: { from: addDays(today, -13), to: addDays(today, -7) },
      }
  }
}

/** Instantes UTC [start, end). */
export type UtcRange = { start: Date; end: Date }

const DAY_MS = 24 * 3600 * 1000
const PERIOD_DAYS: Record<Period, number> = { hoy: 1, ayer: 1, '7d': 7 }

/**
 * Límites UTC del período y del previo. Si el período en curso está incompleto (hoy, 7d), el previo
 * se corta en el mismo avance (min(fin del previo, ahora - duración)), para no comparar
 * medio día contra un día entero. 'ayer' compara días completos.
 */
export function periodBounds(
  period: Period,
  now: Date,
): { current: UtcRange; previous: UtcRange; ranges: ReturnType<typeof periodRanges> } {
  const ranges = periodRanges(period, todayInLima(now))
  const cur = limaRangeToUtc(ranges.current.from, ranges.current.to)
  const prev = limaRangeToUtc(ranges.previous.from, ranges.previous.to)
  const prevEnd =
    period === 'ayer'
      ? prev.end
      : new Date(Math.min(prev.end.getTime(), now.getTime() - PERIOD_DAYS[period] * DAY_MS))
  return {
    current: { start: cur.start, end: cur.end },
    previous: { start: prev.start, end: prevEnd },
    ranges,
  }
}
