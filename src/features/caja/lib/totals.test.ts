import { describe, expect, it } from 'vitest'
import {
  computeTotals,
  igvCents,
  itemCount,
  lineTotalCents,
  subtotalCents,
  totalCents,
} from './totals'

describe('totals', () => {
  it('calcula el total de una línea en céntimos', () => {
    expect(lineTotalCents({ unitPriceCents: 300, qty: 3 })).toBe(900)
  })

  it('suma líneas sin errores de coma flotante', () => {
    // 0.1 + 0.2 en flotante da 0.30000000000000004
    const lines = [
      { unitPriceCents: 10, qty: 1 },
      { unitPriceCents: 20, qty: 1 },
    ]
    expect(totalCents(lines)).toBe(30)
  })

  it('total 0 produce subtotal e IGV 0', () => {
    expect(computeTotals([])).toEqual({ subtotal: 0, igv: 0, total: 0 })
  })

  it('extrae el IGV incluido al 18% (S/ 9.10 -> base 7.71, IGV 1.39)', () => {
    const lines = [
      { unitPriceCents: 300, qty: 2 },
      { unitPriceCents: 310, qty: 1 },
    ]
    expect(computeTotals(lines)).toEqual({ subtotal: 771, igv: 139, total: 910 })
  })

  it('IGV exacto cuando el total es divisible: S/ 11.80 -> IGV 1.80', () => {
    expect(subtotalCents(1180)).toBe(1000)
    expect(igvCents(1180)).toBe(180)
  })

  it('subtotal + IGV siempre iguala al total', () => {
    for (const total of [1, 30, 99, 333, 1234, 98765]) {
      expect(subtotalCents(total) + igvCents(total)).toBe(total)
    }
  })

  it('cuenta artículos', () => {
    expect(
      itemCount([
        { unitPriceCents: 100, qty: 2 },
        { unitPriceCents: 100, qty: 3 },
      ]),
    ).toBe(5)
  })
})

describe('totals con importe de línea manual', () => {
  it('usa el importe manual en lugar de unitario × cantidad', () => {
    const lines = [
      { unitPriceCents: 333, qty: 3, totalCents: 1000 },
      { unitPriceCents: 100, qty: 1 },
    ]
    expect(lineTotalCents(lines[0])).toBe(1000)
    expect(totalCents(lines)).toBe(1100)
    const t = computeTotals(lines)
    expect(t.total).toBe(1100)
    expect(t.subtotal + t.igv).toBe(t.total)
  })
})
