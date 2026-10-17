import { describe, expect, it } from 'vitest'
import { exportFileName, parseSalesSearchParams, quickRanges, salesQueryString } from './filters'

// 14/10/2026 13:00 en Lima
const NOW = new Date('2026-10-14T18:00:00Z')
const uuid = '3f2b8c1e-5d7a-4b9e-8c11-2a6f0d9e4b73'

describe('parseSalesSearchParams', () => {
  it('sin parámetros: hoy en Lima, página 1, sin filtros', () => {
    expect(parseSalesSearchParams({}, NOW)).toEqual({
      filters: {
        from: '2026-10-14',
        to: '2026-10-14',
        paymentMethod: undefined,
        status: undefined,
        cashierId: undefined,
        productId: undefined,
        receipt: undefined,
        edited: undefined,
      },
      page: 1,
    })
  })

  it('"hoy" usa la fecha de Lima aunque en UTC ya sea mañana', () => {
    const late = new Date('2026-10-15T04:30:00Z') // 23:30 en Lima
    expect(parseSalesSearchParams({}, late).filters.from).toBe('2026-10-14')
  })

  it('lee los filtros válidos', () => {
    const { filters, page } = parseSalesSearchParams(
      {
        desde: '2026-10-01',
        hasta: '2026-10-10',
        metodo: 'yape_plin',
        estado: 'anulada',
        cajero: 'user-1',
        producto: uuid,
        boleta: 'B001-00038',
        pagina: '3',
      },
      NOW,
    )
    expect(filters).toEqual({
      from: '2026-10-01',
      to: '2026-10-10',
      paymentMethod: 'yape_plin',
      status: 'anulada',
      cashierId: 'user-1',
      productId: uuid,
      receipt: 'B001-00038',
    })
    expect(page).toBe(3)
  })

  it('acepta el estado "pendiente" (Por validar) y lo conserva en el query string', () => {
    const { filters } = parseSalesSearchParams({ estado: 'pendiente' }, NOW)
    expect(filters.status).toBe('pendiente')
    expect(salesQueryString(filters)).toContain('estado=pendiente')
  })

  it('una fecha límite como 9999-12-31 se descarta (antes daba 500)', () => {
    for (const raw of [{ hasta: '9999-12-31' }, { desde: '9999-12-31' }, { desde: '1999-12-31' }]) {
      expect(() => parseSalesSearchParams(raw, NOW)).not.toThrow()
      const { filters } = parseSalesSearchParams(raw, NOW)
      expect(filters.from >= '2000-01-01' && filters.to <= '2100-12-31').toBe(true)
    }
  })

  it('acota el rango a un año como máximo', () => {
    const { filters } = parseSalesSearchParams({ desde: '2020-01-01', hasta: '2026-10-14' }, NOW)
    expect(filters).toMatchObject({ from: '2025-10-14', to: '2026-10-14' })
  })

  it('descarta valores inválidos en vez de fallar', () => {
    const { filters, page } = parseSalesSearchParams(
      {
        desde: '2026-02-31',
        hasta: 'mañana',
        metodo: 'bitcoin',
        estado: 'x',
        producto: 'no-uuid',
        pagina: '-4',
      },
      NOW,
    )
    expect(filters).toMatchObject({ from: '2026-10-14', to: '2026-10-14' })
    expect(filters.paymentMethod).toBeUndefined()
    expect(filters.status).toBeUndefined()
    expect(filters.productId).toBeUndefined()
    expect(page).toBe(1)
  })

  it('ordena un rango invertido y usa el primer valor de un parámetro repetido', () => {
    const { filters } = parseSalesSearchParams(
      { desde: ['2026-10-10', '2026-01-01'], hasta: '2026-10-01' },
      NOW,
    )
    expect(filters).toMatchObject({ from: '2026-10-01', to: '2026-10-10' })
  })
})

describe('salesQueryString / exportFileName / quickRanges', () => {
  it('ida y vuelta de los filtros por la URL', () => {
    const { filters } = parseSalesSearchParams({ desde: '2026-10-01', metodo: 'tarjeta' }, NOW)
    const qs = salesQueryString(filters, 2)
    const back = parseSalesSearchParams(Object.fromEntries(new URLSearchParams(qs)), NOW)
    expect(back).toEqual({ filters, page: 2 })
  })

  it('nombra el archivo con el rango', () => {
    expect(exportFileName({ from: '2026-10-01', to: '2026-10-14' })).toBe(
      'ventas-2026-10-01_2026-10-14.csv',
    )
  })

  it('atajos: hoy, 7 días (incluye hoy) y mes', () => {
    const [hoy, sem, mes] = quickRanges('2026-10-14')
    expect(hoy).toMatchObject({ from: '2026-10-14', to: '2026-10-14' })
    expect(sem).toMatchObject({ from: '2026-10-08', to: '2026-10-14' })
    expect(mes).toMatchObject({ from: '2026-10-01', to: '2026-10-14' })
  })
})

describe('filtro editado', () => {
  it('editado=1 activa el filtro; cualquier otro valor se descarta', () => {
    expect(parseSalesSearchParams({ editado: '1' }, NOW).filters.edited).toBe(true)
    expect(parseSalesSearchParams({ editado: '0' }, NOW).filters.edited).toBeUndefined()
    expect(parseSalesSearchParams({ editado: 'x' }, NOW).filters.edited).toBeUndefined()
  })

  it('salesQueryString lo conserva solo si está activo', () => {
    const base = { from: '2026-10-14', to: '2026-10-14' }
    expect(salesQueryString({ ...base, edited: true })).toContain('editado=1')
    expect(salesQueryString(base)).not.toContain('editado')
  })
})
