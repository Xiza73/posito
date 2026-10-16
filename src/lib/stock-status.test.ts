import { describe, expect, it } from 'vitest'
import { stockStatus } from './stock-status'

describe('stockStatus', () => {
  it('sin control de stock nunca alerta', () => {
    expect(stockStatus({ tracksStock: false, stock: 0, minStock: 5 })).toBe('untracked')
  })
  it('stock 0 = agotado', () => {
    expect(stockStatus({ tracksStock: true, stock: 0, minStock: 0 })).toBe('out')
  })
  it('stock <= mínimo = bajo (incluye el borde)', () => {
    expect(stockStatus({ tracksStock: true, stock: 5, minStock: 5 })).toBe('low')
    expect(stockStatus({ tracksStock: true, stock: 3, minStock: 5 })).toBe('low')
  })
  it('stock por encima del mínimo = ok', () => {
    expect(stockStatus({ tracksStock: true, stock: 6, minStock: 5 })).toBe('ok')
    expect(stockStatus({ tracksStock: true, stock: 1, minStock: 0 })).toBe('ok')
  })
})
