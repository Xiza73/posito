import { describe, expect, it } from 'vitest'
import { type ExportRow, toCsv } from './csv'

const row: ExportRow = {
  series: 'B001',
  number: 38,
  createdAt: '2026-10-15T04:30:00.000Z', // 23:30 del 14 en Lima
  cashierName: 'Ana Rojas',
  paymentMethod: 'yape_plin',
  status: 'completada',
  subtotalCents: 585,
  igvCents: 105,
  totalCents: 690,
  items: [
    { name: 'Inca Kola 500 ml', qty: 2 },
    { name: 'Pan', qty: 1 },
  ],
  voidReason: null,
}

describe('toCsv', () => {
  const csv = toCsv([row])

  it('empieza con BOM UTF-8, usa CRLF y termina con salto de línea', () => {
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv.slice(1).split('\r\n')).toHaveLength(3) // cabecera + 1 fila + vacío final
    expect(csv.slice(1).replaceAll('\r\n', '')).not.toMatch(/\n/)
  })

  it('cabecera y orden de columnas', () => {
    expect(csv.slice(1).split('\r\n')[0]).toBe(
      'Boleta,Fecha,Cajero,Método,Estado,Subtotal,IGV,Total,Productos,Motivo anulación',
    )
  })

  it('una venta: boleta, fecha de Lima, importes con punto y productos', () => {
    expect(csv.slice(1).split('\r\n')[1]).toBe(
      'B001-00038,2026-10-14 23:30,Ana Rojas,Yape / Plin,Completada,5.85,1.05,6.90,2x Inca Kola 500 ml | 1x Pan,',
    )
  })

  it('venta anulada con motivo con coma queda entrecomillado', () => {
    const out = toCsv([{ ...row, status: 'anulada', voidReason: 'Otro: se cobró, doble' }])
    expect(out.slice(1).split('\r\n')[1]).toMatch(/,Anulada,.*,"Otro: se cobró, doble"$/)
  })

  it('venta pendiente sale como "Por validar"', () => {
    const out = toCsv([{ ...row, status: 'pendiente' }])
    expect(out.slice(1).split('\r\n')[1]).toMatch(/,Por validar,/)
  })

  it('cajero o producto maliciosos salen neutralizados', () => {
    const out = toCsv([
      { ...row, cashierName: '=cmd|calc', items: [{ name: 'x', qty: 1 }], voidReason: '@x' },
    ])
    const line = out.slice(1).split('\r\n')[1]
    expect(line).toContain(",'=cmd|calc,")
    expect(line.endsWith(",'@x")).toBe(true)
  })

  it('sin filas: solo cabecera', () => {
    expect(toCsv([]).slice(1).split('\r\n')).toHaveLength(2)
  })

  it('cajero desconocido queda vacío', () => {
    expect(
      toCsv([{ ...row, cashierName: null }])
        .slice(1)
        .split('\r\n')[1],
    ).toContain('2026-10-14 23:30,,Yape')
  })
})
