import { describe, expect, it } from 'vitest'
import {
  addDays,
  formatLimaDateTime,
  isValidDateString,
  limaDayStart,
  limaRangeToUtc,
  todayInLima,
} from './lima-time'

describe('todayInLima', () => {
  it('a las 23:30 de Lima sigue siendo el mismo día (ya es el día siguiente en UTC)', () => {
    expect(todayInLima(new Date('2026-10-15T04:30:00Z'))).toBe('2026-10-14')
  })

  it('a las 00:00 de Lima empieza el día nuevo', () => {
    expect(todayInLima(new Date('2026-10-15T05:00:00Z'))).toBe('2026-10-15')
    expect(todayInLima(new Date('2026-10-15T04:59:59Z'))).toBe('2026-10-14')
  })

  it('cruza fin de año', () => {
    expect(todayInLima(new Date('2027-01-01T04:59:00Z'))).toBe('2026-12-31')
  })
})

describe('limaDayStart / limaRangeToUtc', () => {
  it('00:00 de Lima es 05:00 UTC', () => {
    expect(limaDayStart('2026-10-14').toISOString()).toBe('2026-10-14T05:00:00.000Z')
  })

  it('el rango es [inicio de from, inicio del día siguiente a to)', () => {
    const { start, end } = limaRangeToUtc('2026-10-13', '2026-10-14')
    expect(start.toISOString()).toBe('2026-10-13T05:00:00.000Z')
    expect(end.toISOString()).toBe('2026-10-15T05:00:00.000Z')
  })

  it('un solo día dura 24 h', () => {
    const { start, end } = limaRangeToUtc('2026-02-28', '2026-02-28')
    expect(end.getTime() - start.getTime()).toBe(24 * 3600 * 1000)
  })

  it('una venta a las 23:30 de Lima cae dentro de ese día y no del siguiente', () => {
    const sale = new Date('2026-10-15T04:30:00Z') // 23:30 del 14 en Lima
    const day14 = limaRangeToUtc('2026-10-14', '2026-10-14')
    const day15 = limaRangeToUtc('2026-10-15', '2026-10-15')
    expect(sale >= day14.start && sale < day14.end).toBe(true)
    expect(sale >= day15.start && sale < day15.end).toBe(false)
  })

  it('rechaza fechas con formato inválido', () => {
    expect(() => limaDayStart('14/10/2026')).toThrow()
  })
})

describe('addDays / isValidDateString', () => {
  it('suma y resta días cruzando mes y año', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('valida fechas reales de calendario', () => {
    expect(isValidDateString('2026-10-14')).toBe(true)
    expect(isValidDateString('2026-02-31')).toBe(false)
    expect(isValidDateString('2026-13-01')).toBe(false)
    expect(isValidDateString('hoy')).toBe(false)
    expect(isValidDateString('2026-1-1')).toBe(false)
  })
})

describe('formatLimaDateTime', () => {
  it('formatea YYYY-MM-DD HH:mm en hora de Lima', () => {
    expect(formatLimaDateTime('2026-10-14T18:05:00Z')).toBe('2026-10-14 13:05')
    expect(formatLimaDateTime('2026-10-15T04:30:00Z')).toBe('2026-10-14 23:30')
    expect(formatLimaDateTime('2026-10-15T05:00:00Z')).toBe('2026-10-15 00:00')
  })
})
