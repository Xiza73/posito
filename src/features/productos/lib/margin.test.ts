import { describe, expect, it } from 'vitest'
import { formatCents } from '@/lib/format'
import { computeMargin, formatMargin } from './margin'

describe('computeMargin', () => {
  it('precio − costo y % del precio (entero)', () => {
    expect(computeMargin(500, 300)).toEqual({ cents: 200, percent: 40, warning: false })
    expect(computeMargin(350, 260)).toEqual({ cents: 90, percent: 26, warning: false }) // 25.7
  })

  it('sin costo = null', () => {
    expect(computeMargin(500, null)).toBeNull()
  })

  it('costo igual o mayor al precio: cero/negativo con aviso', () => {
    expect(computeMargin(500, 500)).toEqual({ cents: 0, percent: 0, warning: true })
    expect(computeMargin(400, 500)).toEqual({ cents: -100, percent: -25, warning: true })
  })

  it('precio 0: sin porcentaje', () => {
    expect(computeMargin(0, 100)).toEqual({ cents: -100, percent: null, warning: true })
  })
})

describe('formatMargin', () => {
  const fmt = (m: ReturnType<typeof computeMargin>) =>
    formatMargin(m, formatCents).replaceAll(' ', ' ')

  it('formatea importe y porcentaje', () => {
    expect(fmt(computeMargin(500, 300))).toBe('Margen S/ 2.00 · 40 %')
    expect(fmt(computeMargin(400, 500))).toBe('Margen -S/ 1.00 · -25 %')
    expect(fmt(computeMargin(0, 100))).toBe('Margen -S/ 1.00')
  })

  it('sin costo = "—"', () => {
    expect(fmt(null)).toBe('—')
  })
})
