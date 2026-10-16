import { describe, expect, it } from 'vitest'
import { customersQueryString, exportFileName, parseCustomersSearchParams } from './filters'

describe('parseCustomersSearchParams', () => {
  it('sin parámetros: búsqueda vacía, solo activos, página 1', () => {
    expect(parseCustomersSearchParams({}, true)).toEqual({
      filters: { query: '', includeInactive: false },
      page: 1,
    })
  })

  it('lee q, inactivos y pagina', () => {
    const r = parseCustomersSearchParams({ q: '  Ana ', inactivos: '1', pagina: '3' }, true)
    expect(r).toEqual({ filters: { query: 'Ana', includeInactive: true }, page: 3 })
  })

  it('ignora "inactivos" si el rol no puede verlos', () => {
    expect(parseCustomersSearchParams({ inactivos: '1' }, false).filters.includeInactive).toBe(
      false,
    )
  })

  it('descarta valores inválidos en vez de romper', () => {
    const r = parseCustomersSearchParams(
      { q: 'x'.repeat(200), inactivos: 'si', pagina: '-4' },
      true,
    )
    expect(r).toEqual({ filters: { query: '', includeInactive: false }, page: 1 })
  })

  it('usa el primer valor si un parámetro viene repetido', () => {
    expect(parseCustomersSearchParams({ q: ['a', 'b'] }, true).filters.query).toBe('a')
  })
})

describe('customersQueryString / exportFileName', () => {
  it('arma el query string solo con lo activo', () => {
    expect(customersQueryString({ query: '', includeInactive: false })).toBe('')
    expect(customersQueryString({ query: 'Ana Ruiz', includeInactive: true })).toBe(
      'q=Ana+Ruiz&inactivos=1',
    )
  })

  it('nombra el archivo con la fecha', () => {
    expect(exportFileName('2026-10-16')).toBe('clientes-2026-10-16.csv')
  })
})
