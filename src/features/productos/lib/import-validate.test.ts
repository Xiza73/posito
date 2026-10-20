import { describe, expect, it } from 'vitest'
import type { RawImportRow } from './import-parse'
import {
  classify,
  type ExistingProduct,
  indexExisting,
  parseTracksStock,
  toPreview,
  validateRow,
  validateRows,
} from './import-validate'

let line = 1
const raw = (over: Partial<RawImportRow> = {}): RawImportRow => ({
  line: ++line,
  name: 'Inca Kola',
  price: '3.50',
  cost: '',
  category: '',
  barcode: '',
  stock: '',
  minStock: '',
  tracksStock: '',
  ...over,
})

const prod = (over: Partial<ExistingProduct> = {}): ExistingProduct => ({
  id: 'p1',
  name: 'Inca Kola',
  nameKey: 'inca kola',
  barcode: null,
  tracksStock: true,
  priceCents: 350,
  hasTiers: false,
  ...over,
})

const run = (rows: RawImportRow[], existing: ExistingProduct[] = []) =>
  classify(validateRows(rows), indexExisting(existing))

describe('validateRow: costo', () => {
  it('vacío = sin costo; con valor se guarda en céntimos', () => {
    expect(validateRow(raw()).input?.costCents).toBeNull()
    expect(validateRow(raw({ cost: '2.60' })).input?.costCents).toBe(260)
    expect(validateRow(raw({ cost: '0' })).input?.costCents).toBe(0)
    expect(validateRow(raw({ cost: '2,6' })).input?.costCents).toBe(260)
  })

  it('rechaza costo inválido con error en la columna costo', () => {
    for (const cost of ['-1', 'abc', '1.234', '1234567']) {
      const res = validateRow(raw({ cost }))
      expect(res.input).toBeUndefined()
      expect(res.errors).toEqual([expect.objectContaining({ field: 'cost' })])
    }
  })

  it('un costo mayor al precio es válido (solo se avisa en la UI)', () => {
    expect(validateRow(raw({ price: '3.50', cost: '5' })).input?.costCents).toBe(500)
  })
})

describe('classify: productos con precios por mayor', () => {
  it('existente con niveles y precio distinto = error (vista previa y commit)', () => {
    const rows = run([raw({ name: 'Inca Kola', price: '4.00' })], [prod({ hasTiers: true })])
    expect(rows[0].status).toBe('error')
    expect(rows[0].errors[0]).toMatchObject({
      field: 'price',
      message: 'Tiene precios por mayor: cambia su precio desde el producto',
    })
  })

  it('con niveles y el MISMO precio sigue siendo existente', () => {
    const rows = run([raw({ name: 'Inca Kola', price: '3.50' })], [prod({ hasTiers: true })])
    expect(rows[0].status).toBe('existing')
  })

  it('sin niveles el cambio de precio es normal; con el bloqueo apagado también', () => {
    expect(run([raw({ price: '4.00' })], [prod()])[0].status).toBe('existing')
    const off = classify(
      validateRows([raw({ price: '4.00' })]),
      indexExisting([prod({ hasTiers: true })]),
      {
        blockTieredPriceChange: false,
      },
    )
    expect(off[0].status).toBe('existing')
  })
})

describe('parseTracksStock', () => {
  it.each([
    ['', true],
    ['si', true],
    ['SÍ', true],
    ['1', true],
    ['true', true],
    ['no', false],
    ['No', false],
    ['0', false],
    ['FALSE', false],
    ['quizás', null],
    ['2', null],
  ])('%j -> %j', (value, expected) => {
    expect(parseTracksStock(value)).toBe(expected)
  })
})

describe('validateRow', () => {
  it('fila mínima: nombre y precio; el resto toma valores por defecto', () => {
    const v = validateRow(raw({ name: '  Arroz   extra ', price: '4,80' }))
    expect(v.errors).toEqual([])
    expect(v.input).toEqual({
      name: 'Arroz extra',
      nameKey: 'arroz extra',
      barcode: null,
      priceCents: 480,
      costCents: null,
      categoryName: null,
      categoryKey: null,
      tracksStock: true,
      stock: 0,
      minStock: 0,
    })
  })

  it('normaliza categoría y código; clave sin tildes ni mayúsculas', () => {
    const v = validateRow(
      raw({ category: ' LÁCTEOS  frescos ', barcode: ' 775ABC ', stock: '10', minStock: '2' }),
    )
    expect(v.input).toMatchObject({
      categoryName: 'LÁCTEOS frescos',
      categoryKey: 'lacteos frescos',
      barcode: '775ABC',
      stock: 10,
      minStock: 2,
    })
  })

  it('controla_stock=no fuerza stock y mínimo a 0', () => {
    const v = validateRow(raw({ tracksStock: 'no', stock: '30', minStock: '5' }))
    expect(v.input).toMatchObject({ tracksStock: false, stock: 0, minStock: 0 })
  })

  it('errores por campo con el nombre de la columna del archivo', () => {
    const v = validateRow(
      raw({
        name: 'A',
        price: '1.234',
        barcode: 'ab-12',
        stock: '-1',
        minStock: '1.5',
        tracksStock: 'tal vez',
      }),
    )
    expect(v.input).toBeUndefined()
    expect(v.errors.map((e) => e.field).sort()).toEqual(
      ['barcode', 'minStock', 'name', 'price', 'stock', 'tracksStock'].sort(),
    )
    expect(v.errors.find((e) => e.field === 'stock')?.message).toContain('número entero')
  })

  it.each([
    ['', false],
    ['abc', false],
    ['-1', false],
    ['1,248.50', false],
    ['1e3', false],
    ['0', true],
    ['3', true],
    ['3.5', true],
    ['999999.99', true],
    ['1000000', false],
  ])('precio %j válido=%j', (price, ok) => {
    expect(validateRow(raw({ price })).errors.length === 0).toBe(ok)
  })

  it('un solo error por campo', () => {
    const v = validateRow(raw({ name: '' }))
    expect(v.errors.filter((e) => e.field === 'name')).toHaveLength(1)
  })

  it('nombre demasiado largo', () => {
    expect(validateRow(raw({ name: 'x'.repeat(81) })).errors[0].field).toBe('name')
  })
})

describe('classify', () => {
  it('nuevas, existentes (por name_key normalizado) y errores', () => {
    const rows = run(
      [raw({ name: 'Producto nuevo' }), raw({ name: '  INCA   kola ' }), raw({ price: 'x' })],
      [prod()],
    )
    expect(rows.map((r) => r.status)).toEqual(['new', 'existing', 'error'])
    expect(rows[1].existing?.id).toBe('p1')
  })

  it('repetida en el archivo: gana la primera (por nombre normalizado)', () => {
    const rows = run([
      raw({ name: 'Galleta' }),
      raw({ name: 'galleta ' }),
      raw({ name: 'GALLETA' }),
    ])
    expect(rows.map((r) => r.status)).toEqual(['new', 'duplicate', 'duplicate'])
    expect(rows[1].duplicateOfLine).toBe(rows[0].line)
    expect(rows[2].duplicateOfLine).toBe(rows[0].line)
  })

  it('repetida en el archivo por código de barras', () => {
    const rows = run([raw({ name: 'Uno', barcode: '123' }), raw({ name: 'Dos', barcode: '123' })])
    expect(rows.map((r) => r.status)).toEqual(['new', 'duplicate'])
  })

  it('una existente repetida después también es repetida', () => {
    const rows = run([raw({ name: 'Inca Kola' }), raw({ name: 'inca kola' })], [prod()])
    expect(rows.map((r) => r.status)).toEqual(['existing', 'duplicate'])
  })

  it('una fila con error no hace "repetidas" a las siguientes', () => {
    const rows = run([raw({ name: 'Mala', price: 'x' }), raw({ name: 'Mala' })])
    expect(rows.map((r) => r.status)).toEqual(['error', 'new'])
  })

  it('código de barras del mismo producto (mismo nombre): existente', () => {
    const rows = run([raw({ name: 'Inca Kola', barcode: '775' })], [prod({ barcode: '775' })])
    expect(rows[0].status).toBe('existing')
  })

  it('código de barras de otro producto (nombre nuevo): error con el nombre del dueño', () => {
    const rows = run(
      [raw({ name: 'Nombre nuevo', barcode: '775' })],
      [prod({ name: 'Inca Kola', barcode: '775' })],
    )
    expect(rows[0].status).toBe('error')
    expect(rows[0].errors).toEqual([
      { field: 'barcode', message: 'El código de barras pertenece a otro producto (Inca Kola)' },
    ])
  })

  it('el nombre coincide con A pero el código es de B: error', () => {
    const rows = run(
      [raw({ name: 'Inca Kola', barcode: '999' })],
      [prod(), prod({ id: 'p2', name: 'Coca Cola', nameKey: 'coca cola', barcode: '999' })],
    )
    expect(rows[0].status).toBe('error')
    expect(rows[0].errors[0].message).toContain('Coca Cola')
  })

  it('el código sin dueño con nombre existente: existente (el código no se toca)', () => {
    const rows = run([raw({ name: 'Inca Kola', barcode: '000' })], [prod({ barcode: '775' })])
    expect(rows[0].status).toBe('existing')
  })

  it('un error de barras no registra la fila como vista', () => {
    const rows = run(
      [raw({ name: 'Xx', barcode: '775' }), raw({ name: 'Xx' })],
      [prod({ barcode: '775' })],
    )
    expect(rows.map((r) => r.status)).toEqual(['error', 'new'])
  })

  it('ñ distingue nombres; tildes no', () => {
    const rows = run([
      raw({ name: 'Año' }),
      raw({ name: 'Ano' }),
      raw({ name: 'Lácteo' }),
      raw({ name: 'Lacteo' }),
    ])
    expect(rows.map((r) => r.status)).toEqual(['new', 'new', 'new', 'duplicate'])
  })
})

describe('toPreview', () => {
  it('cuenta por estado y trae notas para existentes y repetidas', () => {
    const rows = [
      raw({ name: 'Inca Kola', stock: '4' }),
      raw({ name: 'inca kola' }),
      raw({ name: 'Nueva', price: '2' }),
      raw({ name: 'Mala', price: 'zz' }),
    ]
    const preview = toPreview(rows, run(rows, [prod()]))
    expect(preview.counts).toEqual({ new: 1, existing: 1, duplicate: 1, error: 1 })
    expect(preview.rows[0]).toMatchObject({
      status: 'existing',
      note: 'Coincide con «Inca Kola»',
      stock: '4',
    })
    expect(preview.rows[1].note).toBe(`Igual a la fila ${rows[0].line}`)
    expect(preview.rows[2]).toMatchObject({ priceCents: 200, note: null })
    expect(preview.rows[3]).toMatchObject({ priceCents: null, price: 'zz' })
    expect(preview.rows[3].errors[0].field).toBe('price')
  })
})
