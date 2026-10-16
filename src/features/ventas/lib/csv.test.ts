import { describe, expect, it } from 'vitest'
import { centsToDecimal, csvCell, type ExportRow, toCsv } from './csv'

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

describe('centsToDecimal', () => {
  it('formatea con dos decimales usando enteros', () => {
    expect(centsToDecimal(910)).toBe('9.10')
    expect(centsToDecimal(5)).toBe('0.05')
    expect(centsToDecimal(0)).toBe('0.00')
    expect(centsToDecimal(100)).toBe('1.00')
    expect(centsToDecimal(123456789)).toBe('1234567.89')
  })

  it('no sufre errores de float', () => {
    expect(centsToDecimal(1005)).toBe('10.05')
    expect(centsToDecimal(29)).toBe('0.29')
  })
})

describe('csvCell (RFC 4180)', () => {
  it('deja intacto el texto simple', () => {
    expect(csvCell('Inca Kola')).toBe('Inca Kola')
  })

  it('entrecomilla comas, comillas y saltos de línea; duplica las comillas', () => {
    expect(csvCell('Pan, queso')).toBe('"Pan, queso"')
    expect(csvCell('Dijo "hola"')).toBe('"Dijo ""hola"""')
    expect(csvCell('a\nb')).toBe('"a\nb"')
    expect(csvCell('a\r\nb')).toBe('"a\r\nb"')
  })
})

describe('csvCell: inyección de fórmulas', () => {
  it.each(['=1+1', '+1', '-1', '@SUMA(A1)', '\tx', '\rx'])('neutraliza %j', (v) => {
    expect(csvCell(v).replace(/^"/, '').startsWith("'")).toBe(true)
  })

  it('el apóstrofo va antes de entrecomillar', () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"')
  })

  it('no toca texto que empieza distinto', () => {
    expect(csvCell('Pan -5%')).toBe('Pan -5%')
    expect(csvCell('2x =trampa')).toBe('2x =trampa')
  })
})

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
