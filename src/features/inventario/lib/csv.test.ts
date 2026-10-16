import { describe, expect, it } from 'vitest'
import { type StockCsvRow, stockToCsv } from './csv'

const row: StockCsvRow = {
  name: 'Inca Kola 500 ml',
  categoryName: 'Bebidas',
  barcode: '7750182000011',
  stock: 12,
  minStock: 5,
  tracksStock: true,
  active: true,
}

const lines = (rows: StockCsvRow[]) => stockToCsv(rows).slice(1).split('\r\n')

describe('stockToCsv', () => {
  it('BOM, CRLF y cabecera', () => {
    const csv = stockToCsv([row])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(lines([row])[0]).toBe('Producto,Categoría,Código,Stock,Stock mínimo,Estado,Activo')
  })

  it('fila normal: OK y activo', () => {
    expect(lines([row])[1]).toBe('Inca Kola 500 ml,Bebidas,7750182000011,12,5,OK,Sí')
  })

  it('estados: stock bajo, agotado, no controla stock', () => {
    expect(lines([{ ...row, stock: 5 }])[1]).toContain(',Stock bajo,')
    expect(lines([{ ...row, stock: 0 }])[1]).toContain(',Agotado,')
    const untracked = lines([{ ...row, tracksStock: false, stock: 0, minStock: 0 }])[1]
    expect(untracked).toBe('Inca Kola 500 ml,Bebidas,7750182000011,,,No controla stock,Sí')
  })

  it('inactivo y sin categoría ni código', () => {
    expect(lines([{ ...row, active: false, categoryName: null, barcode: null }])[1]).toBe(
      'Inca Kola 500 ml,,,12,5,OK,No',
    )
  })

  it('neutraliza fórmulas en nombre, categoría y código', () => {
    const line = lines([{ ...row, name: '=cmd|calc', categoryName: '+x', barcode: '@y' }])[1]
    expect(line.startsWith("'=cmd|calc,'+x,'@y,")).toBe(true)
  })

  it('entrecomilla comas', () => {
    expect(lines([{ ...row, name: 'Pan, queso' }])[1].startsWith('"Pan, queso",')).toBe(true)
  })

  it('sin filas: solo cabecera', () => {
    expect(lines([])).toHaveLength(2)
  })
})
