import { describe, expect, it } from 'vitest'
import { canAddMore, isSoldOut, matchesQuery, stockLabel } from './catalog'

const tracked = { tracksStock: true, stock: 3 }
const made = { tracksStock: false, stock: 0 }

describe('catálogo de caja', () => {
  it('sin control de stock nunca está agotado ni limita la cantidad', () => {
    expect(isSoldOut(made)).toBe(false)
    expect(canAddMore(made, 500)).toBe(true)
    expect(stockLabel(made)).toBe('Preparado')
  })

  it('con control de stock limita al stock disponible', () => {
    expect(canAddMore(tracked, 2)).toBe(true)
    expect(canAddMore(tracked, 3)).toBe(false)
    expect(isSoldOut({ tracksStock: true, stock: 0 })).toBe(true)
    expect(stockLabel({ tracksStock: true, stock: 0 })).toBe('Agotado')
    expect(stockLabel(tracked)).toBe('3 u.')
  })

  it('busca por nombre o código de barras', () => {
    const p = { name: 'Leche Gloria', barcode: 'ABC123' }
    expect(matchesQuery(p, '')).toBe(true)
    expect(matchesQuery(p, 'gloria')).toBe(true)
    expect(matchesQuery(p, 'abc12')).toBe(true)
    expect(matchesQuery(p, 'xyz')).toBe(false)
    expect(matchesQuery({ name: 'Pan', barcode: null }, 'abc')).toBe(false)
  })
})
