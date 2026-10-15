import { describe, expect, it } from 'vitest'
import {
  cellToString,
  decodeCsv,
  IMPORT_MAX_ROWS,
  IMPORT_TEMPLATE_CSV,
  numberToString,
  parseCsv,
  parseCsvFile,
  rowsFromSheet,
} from './import-parse'

describe('parseCsv', () => {
  it('separa por comas y soporta CRLF y LF', () => {
    expect(parseCsv('a,b\r\n1,2\n3,4')).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ])
  })

  it('quita el BOM', () => {
    expect(parseCsv('﻿a,b\n1,2')[0]).toEqual(['a', 'b'])
  })

  it('comillas: coma, salto de línea y comillas escapadas dentro de una celda', () => {
    expect(parseCsv('a,b\n"x, y","l1\nl2"\n"di ""hola""",z')).toEqual([
      ['a', 'b'],
      ['x, y', 'l1\nl2'],
      ['di "hola"', 'z'],
    ])
  })

  it('usa ; si la primera línea lo tiene y no tiene comas', () => {
    expect(parseCsv('nombre;precio\nInca;3,50')).toEqual([
      ['nombre', 'precio'],
      ['Inca', '3,50'],
    ])
  })

  it('con comas en el encabezado, ; es parte del texto', () => {
    expect(parseCsv('a,b\nx;y,z')).toEqual([
      ['a', 'b'],
      ['x;y', 'z'],
    ])
  })

  it('celdas vacías, última línea sin salto y salto final sin registro extra', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ])
    expect(parseCsv('a,b\n1,2\n')).toHaveLength(2)
    expect(parseCsv('')).toEqual([])
  })
})

describe('numberToString / cellToString', () => {
  it('enteros sin notación científica', () => {
    expect(numberToString(24)).toBe('24')
    expect(numberToString(7750001000011)).toBe('7750001000011')
    expect(numberToString(1e21)).toBe('1e+21')
  })

  it('decimales con ruido de float -> 2 decimales con aritmética entera', () => {
    expect(numberToString(3.5)).toBe('3.50')
    expect(numberToString(3.1 + 4.4e-16)).toBe('3.10')
    expect(numberToString(0.1 + 0.2)).toBe('0.30')
    expect(numberToString(1.005)).toBe('1.005') // 3 decimales reales: lo rechaza la validación
    expect(numberToString(0.07)).toBe('0.07')
  })

  it('negativos y no finitos se dejan para que la validación los rechace', () => {
    expect(numberToString(-3.5)).toBe('-3.5')
    expect(numberToString(Number.NaN)).toBe('NaN')
  })

  it('cellToString: texto recortado, vacíos, booleanos y fechas', () => {
    expect(cellToString('  hola ')).toBe('hola')
    expect(cellToString(null)).toBe('')
    expect(cellToString(undefined)).toBe('')
    expect(cellToString(true)).toBe('true')
    expect(cellToString(new Date('2026-01-02T00:00:00Z'))).toBe('2026-01-02T00:00:00.000Z')
  })
})

describe('rowsFromSheet', () => {
  const header = ['Nombre', 'Precio']

  it('mapea columnas por nombre, en cualquier orden, e ignora las extra', () => {
    const res = rowsFromSheet([
      ['Notas', 'PRECIO', 'nombre', 'Stock'],
      ['x', '3.50', 'Inca Kola', '5'],
    ])
    expect(res).toEqual({
      ok: true,
      rows: [
        {
          line: 2,
          name: 'Inca Kola',
          price: '3.50',
          category: '',
          barcode: '',
          stock: '5',
          minStock: '',
          tracksStock: '',
        },
      ],
    })
  })

  it('acepta encabezados con tildes, mayúsculas, espacios y guiones bajos', () => {
    const res = rowsFromSheet([
      [
        'Nombre',
        'Precio',
        'Categoría',
        'Código de barras',
        'Stock',
        'Stock mínimo',
        'Controla stock',
      ],
      ['A', '1', 'C', '123', '1', '2', 'no'],
    ])
    expect(res).toMatchObject({
      ok: true,
      rows: [{ category: 'C', barcode: '123', stock: '1', minStock: '2', tracksStock: 'no' }],
    })
    const res2 = rowsFromSheet([
      ['nombre', 'precio', 'categoria', 'codigo_barras', 'stock', 'stock_minimo', 'controla_stock'],
      ['A', '1', 'C', '123', '1', '2', 'no'],
    ])
    expect(res2).toEqual(res)
  })

  it('falta una columna obligatoria -> error de archivo', () => {
    const res = rowsFromSheet([
      ['Nombre', 'Stock'],
      ['A', '1'],
    ])
    expect(res).toMatchObject({ ok: false })
    expect(res.ok === false && res.error).toContain('«precio»')
    const res2 = rowsFromSheet([['Stock'], ['1']])
    expect(res2.ok === false && res2.error).toContain('«nombre» y «precio»')
  })

  it('salta filas vacías pero conserva la numeración del archivo', () => {
    const res = rowsFromSheet([header, ['A', '1'], ['', ''], [], ['  ', null], ['B', '2']])
    expect(res.ok && res.rows.map((r) => [r.line, r.name])).toEqual([
      [2, 'A'],
      [6, 'B'],
    ])
  })

  it('ignora filas vacías antes del encabezado', () => {
    const res = rowsFromSheet([[], [''], header, ['A', '1']])
    expect(res.ok && res.rows[0].line).toBe(4)
  })

  it('archivo vacío o sin productos', () => {
    expect(rowsFromSheet([])).toEqual({ ok: false, error: 'El archivo está vacío' })
    expect(rowsFromSheet([header])).toEqual({ ok: false, error: 'El archivo no tiene productos' })
  })

  it('convierte celdas numéricas de Excel sin artefactos de float', () => {
    const res = rowsFromSheet([
      ['nombre', 'precio', 'codigo_barras', 'stock'],
      ['A', 3.1 + 4.4e-16, 7750001000011, 12],
    ])
    expect(res).toMatchObject({
      ok: true,
      rows: [{ price: '3.10', barcode: '7750001000011', stock: '12' }],
    })
  })

  it(`más de ${IMPORT_MAX_ROWS} filas -> error de archivo; exactamente el máximo, bien`, () => {
    const make = (n: number) => [header, ...Array.from({ length: n }, (_, i) => [`P${i}`, '1'])]
    expect(rowsFromSheet(make(IMPORT_MAX_ROWS)).ok).toBe(true)
    const res = rowsFromSheet(make(IMPORT_MAX_ROWS + 1))
    expect(res.ok).toBe(false)
  })
})

describe('parseCsvFile', () => {
  it('CSV completo con ; , BOM y líneas vacías', () => {
    const res = parseCsvFile('﻿Nombre;Precio;Código de barras\r\n\r\nInca;3,50;775\r\n\r\n')
    expect(res).toMatchObject({
      ok: true,
      rows: [{ line: 3, name: 'Inca', price: '3,50', barcode: '775' }],
    })
  })

  it('la plantilla se lee sin errores', () => {
    const res = parseCsvFile(IMPORT_TEMPLATE_CSV)
    expect(res.ok && res.rows).toHaveLength(2)
    expect(IMPORT_TEMPLATE_CSV.startsWith('﻿')).toBe(true)
  })
})

describe('decodeCsv', () => {
  it('UTF-8 válido', () => {
    expect(decodeCsv(new TextEncoder().encode('Año,Café').buffer as ArrayBuffer)).toBe('Año,Café')
  })

  it('cae a Windows-1252 si no es UTF-8 (Excel en Windows)', () => {
    // "Año" en Windows-1252: 41 F1 6F
    const bytes = new Uint8Array([0x41, 0xf1, 0x6f])
    expect(decodeCsv(bytes.buffer)).toBe('Año')
  })
})
