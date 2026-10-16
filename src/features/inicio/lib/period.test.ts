import { describe, expect, it } from 'vitest'
import { parsePeriod, periodBounds, periodRanges } from './period'

describe('parsePeriod', () => {
  it('acepta los valores válidos', () => {
    expect(parsePeriod('hoy')).toBe('hoy')
    expect(parsePeriod('ayer')).toBe('ayer')
    expect(parsePeriod('7d')).toBe('7d')
  })

  it('cae en "hoy" con valores inválidos, vacíos o ausentes', () => {
    expect(parsePeriod('mes')).toBe('hoy')
    expect(parsePeriod('')).toBe('hoy')
    expect(parsePeriod(undefined)).toBe('hoy')
  })

  it('con un parámetro repetido usa el primero', () => {
    expect(parsePeriod(['ayer', '7d'])).toBe('ayer')
    expect(parsePeriod(['x', '7d'])).toBe('hoy')
  })
})

describe('periodRanges', () => {
  const today = '2026-03-01' // cruza fin de mes hacia atrás

  it('hoy se compara con ayer', () => {
    expect(periodRanges('hoy', today)).toEqual({
      current: { from: '2026-03-01', to: '2026-03-01' },
      previous: { from: '2026-02-28', to: '2026-02-28' },
    })
  })

  it('ayer se compara con anteayer', () => {
    expect(periodRanges('ayer', today)).toEqual({
      current: { from: '2026-02-28', to: '2026-02-28' },
      previous: { from: '2026-02-27', to: '2026-02-27' },
    })
  })

  it('7 días incluye hoy y se compara con los 7 días previos, contiguos', () => {
    expect(periodRanges('7d', today)).toEqual({
      current: { from: '2026-02-23', to: '2026-03-01' },
      previous: { from: '2026-02-16', to: '2026-02-22' },
    })
  })
})

describe('periodBounds', () => {
  const iso = (r: { start: Date; end: Date }) => [r.start.toISOString(), r.end.toISOString()]

  it('hoy a las 10:00: el previo es ayer de 00:00 a 10:00 (Lima)', () => {
    const b = periodBounds('hoy', new Date('2026-10-15T10:00:00-05:00'))
    expect(iso(b.current)).toEqual(['2026-10-15T05:00:00.000Z', '2026-10-16T05:00:00.000Z'])
    expect(iso(b.previous)).toEqual(['2026-10-14T05:00:00.000Z', '2026-10-14T15:00:00.000Z'])
  })

  it('justo después de medianoche de Lima el previo es casi vacío', () => {
    const b = periodBounds('hoy', new Date('2026-10-15T00:05:00-05:00'))
    expect(iso(b.previous)).toEqual(['2026-10-14T05:00:00.000Z', '2026-10-14T05:05:00.000Z'])
  })

  it('ayer compara días completos', () => {
    const b = periodBounds('ayer', new Date('2026-10-15T10:00:00-05:00'))
    expect(iso(b.current)).toEqual(['2026-10-14T05:00:00.000Z', '2026-10-15T05:00:00.000Z'])
    expect(iso(b.previous)).toEqual(['2026-10-13T05:00:00.000Z', '2026-10-14T05:00:00.000Z'])
  })

  it('7d: el previo termina 7 días antes de ahora, nunca después de su fin natural', () => {
    const b = periodBounds('7d', new Date('2026-10-15T10:00:00-05:00'))
    expect(iso(b.previous)).toEqual(['2026-10-02T05:00:00.000Z', '2026-10-08T15:00:00.000Z'])
    // fin natural del previo = 2026-10-09 00:00 Lima: ahora-7d queda antes, gana el mínimo
    expect(b.previous.end.getTime()).toBeLessThanOrEqual(b.current.start.getTime())
  })
})
