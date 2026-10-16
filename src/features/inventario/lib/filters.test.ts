import { describe, expect, it } from 'vitest'
import {
  MAX_RANGE_DAYS,
  movementQueryString,
  parseMovementSearchParams,
  parseStockSearchParams,
  stockQueryString,
} from './filters'

// 2026-10-16 15:00 en Lima
const NOW = new Date('2026-10-16T20:00:00.000Z')

describe('parseMovementSearchParams', () => {
  it('por defecto: últimos 7 días (hoy incluido) en hora de Lima', () => {
    const { filters, page } = parseMovementSearchParams({}, NOW)
    expect(filters).toMatchObject({ from: '2026-10-10', to: '2026-10-16' })
    expect(page).toBe(1)
  })

  it('a las 23:30 de Lima del 15 todavía es el 15 (aunque en UTC ya sea 16)', () => {
    const { filters } = parseMovementSearchParams({}, new Date('2026-10-16T04:30:00.000Z'))
    expect(filters.to).toBe('2026-10-15')
  })

  it('rango al revés se ordena', () => {
    const { filters } = parseMovementSearchParams({ desde: '2026-10-10', hasta: '2026-10-01' }, NOW)
    expect(filters).toMatchObject({ from: '2026-10-01', to: '2026-10-10' })
  })

  it('acota el rango a 366 días', () => {
    const { filters } = parseMovementSearchParams({ desde: '2020-01-01', hasta: '2026-10-16' }, NOW)
    expect(filters.to).toBe('2026-10-16')
    expect(filters.from).toBe('2025-10-16')
    const days = (Date.parse(filters.to) - Date.parse(filters.from)) / 86_400_000 + 1
    expect(days).toBe(MAX_RANGE_DAYS)
  })

  it('valores inválidos se descartan', () => {
    const { filters, page } = parseMovementSearchParams(
      { desde: 'x', tipo: 'robo', producto: 'no-uuid', pagina: '-3' },
      NOW,
    )
    expect(filters).toMatchObject({ from: '2026-10-10', to: '2026-10-16' })
    expect(filters.type).toBeUndefined()
    expect(filters.productId).toBeUndefined()
    expect(page).toBe(1)
  })

  it('lee tipo, usuario, producto y página; usa el primero si se repite', () => {
    const id = '5f0f5a6e-2c0e-4a39-9d57-0f0a8d8f3b11'
    const { filters, page } = parseMovementSearchParams(
      { tipo: ['ajuste', 'venta'], usuario: 'u1', producto: id, pagina: '3' },
      NOW,
    )
    expect(filters).toMatchObject({ type: 'ajuste', userId: 'u1', productId: id })
    expect(page).toBe(3)
  })

  it('movementQueryString hace ida y vuelta', () => {
    const { filters } = parseMovementSearchParams({ tipo: 'ingreso' }, NOW)
    const qs = movementQueryString(filters, 2)
    expect(new URLSearchParams(qs).get('tipo')).toBe('ingreso')
    expect(new URLSearchParams(qs).get('pagina')).toBe('2')
    const back = parseMovementSearchParams(Object.fromEntries(new URLSearchParams(qs)), NOW)
    expect(back.filters).toEqual(filters)
  })
})

describe('parseStockSearchParams', () => {
  it('lee búsqueda, categoría y estado', () => {
    const id = '5f0f5a6e-2c0e-4a39-9d57-0f0a8d8f3b11'
    expect(parseStockSearchParams({ q: ' inca ', categoria: id, estado: 'bajo' }, true)).toEqual({
      query: 'inca',
      categoryId: id,
      status: 'bajo',
      includeInactive: false,
    })
  })

  it('inactivos solo si el rol puede verlos', () => {
    expect(parseStockSearchParams({ inactivos: '1' }, true).includeInactive).toBe(true)
    expect(parseStockSearchParams({ inactivos: '1' }, false).includeInactive).toBe(false)
  })

  it('descarta valores inválidos', () => {
    const f = parseStockSearchParams({ estado: 'otro', categoria: 'x' }, true)
    expect(f.status).toBeUndefined()
    expect(f.categoryId).toBeUndefined()
  })

  it('stockQueryString solo incluye lo activo', () => {
    expect(stockQueryString({ query: '', includeInactive: false })).toBe('')
    expect(stockQueryString({ query: 'pan', status: 'agotado', includeInactive: true })).toBe(
      'q=pan&estado=agotado&inactivos=1',
    )
  })
})
