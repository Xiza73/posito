import { describe, expect, it } from 'vitest'
import {
  categoryNameSchema,
  centsToPriceInput,
  parsePriceToCents,
  productInputSchema,
} from './schemas'

describe('parsePriceToCents', () => {
  it.each([
    ['3', 300],
    ['3.5', 350],
    ['3,50', 350],
    ['3.50', 350],
    ['0.10', 10],
    ['0.5', 50],
    ['0', 0],
    ['  12.05 ', 1205],
    ['007', 700],
    ['999999.99', 99999999],
  ])('%j -> %i', (input, cents) => {
    expect(parsePriceToCents(input)).toBe(cents)
  })

  it.each([
    '',
    '   ',
    '-1',
    '-0.50',
    '3.999',
    '3.',
    '.5',
    'abc',
    'NaN',
    '1e3',
    '1,248.50',
    '1.248,50',
    '1 000',
    '3.5.1',
    '1000000',
  ])('rechaza %j', (input) => {
    expect(parsePriceToCents(input)).toBeNull()
  })

  it('no pierde céntimos por coma flotante (0.07, 1.15, 8.2)', () => {
    expect(parsePriceToCents('0.07')).toBe(7)
    expect(parsePriceToCents('1.15')).toBe(115)
    expect(parsePriceToCents('8.2')).toBe(820)
  })
})

describe('centsToPriceInput', () => {
  it('formatea sin floats y es inverso de parsePriceToCents', () => {
    expect(centsToPriceInput(350)).toBe('3.50')
    expect(centsToPriceInput(5)).toBe('0.05')
    expect(centsToPriceInput(0)).toBe('0.00')
    for (const c of [1, 99, 100, 101, 1205, 99999999]) {
      expect(parsePriceToCents(centsToPriceInput(c))).toBe(c)
    }
  })
})

const valid = {
  name: '  Inca Kola 500 ml ',
  barcode: '',
  priceCents: '3,50',
  categoryName: ' Bebidas ',
  tracksStock: true,
  initialStock: '',
  minStock: '5',
  tiers: [] as { minQty: string; price: string }[],
}

describe('productInputSchema', () => {
  it('normaliza: trim, vacío -> null, precio a céntimos, enteros', () => {
    const r = productInputSchema.safeParse(valid)
    expect(r.success).toBe(true)
    expect(r.data).toEqual({
      name: 'Inca Kola 500 ml',
      barcode: null,
      priceCents: 350,
      categoryName: 'Bebidas',
      tracksStock: true,
      showInStore: true,
      initialStock: 0,
      minStock: 5,
      tiers: [],
    })
  })

  describe('costo (opcional)', () => {
    it('ausente = undefined (no tocar); vacío = null; valor = céntimos', () => {
      expect(productInputSchema.parse(valid).costCents).toBeUndefined()
      expect(productInputSchema.parse({ ...valid, costCents: '  ' }).costCents).toBeNull()
      expect(productInputSchema.parse({ ...valid, costCents: '2,10' }).costCents).toBe(210)
      expect(productInputSchema.parse({ ...valid, costCents: '0' }).costCents).toBe(0)
    })

    it('rechaza negativos, más de 2 decimales y texto', () => {
      for (const costCents of ['-1', '1.234', 'abc', '1234567']) {
        const r = productInputSchema.safeParse({ ...valid, costCents })
        expect(r.success).toBe(false)
        expect(r.error?.issues[0].path).toEqual(['costCents'])
      }
    })

    it('un costo mayor al precio es válido', () => {
      expect(productInputSchema.parse({ ...valid, costCents: '9' }).costCents).toBe(900)
    })
  })

  it('showInStore: visible por defecto y respeta false', () => {
    expect(productInputSchema.parse({ ...valid, showInStore: false }).showInStore).toBe(false)
  })

  describe('precio por mayor (tiers)', () => {
    const ok = [
      { minQty: '6', price: '2.50' },
      { minQty: '12', price: '2,30' },
    ]

    it('convierte filas a niveles en céntimos e ignora filas vacías', () => {
      const r = productInputSchema.parse({
        ...valid,
        tiers: [...ok, { minQty: ' ', price: '' }],
      })
      expect(r.tiers).toEqual([
        { minQty: 6, unitPriceCents: 250 },
        { minQty: 12, unitPriceCents: 230 },
      ])
    })

    it('una fila a medias o inválida es error', () => {
      for (const row of [
        { minQty: '6', price: '' },
        { minQty: '', price: '2.50' },
        { minQty: '2.5', price: '2.50' },
        { minQty: '6', price: 'abc' },
      ]) {
        const r = productInputSchema.safeParse({ ...valid, tiers: [row] })
        expect(r.success).toBe(false)
        expect(r.error?.issues[0]?.path).toEqual(['tiers'])
      }
    })

    it('valida contra el precio normal (S/ 3.50) con las reglas de validateTiers', () => {
      const bad = (tiers: { minQty: string; price: string }[]) =>
        productInputSchema.safeParse({ ...valid, tiers }).success
      expect(bad([{ minQty: '6', price: '3.50' }])).toBe(false) // no abarata
      expect(bad([{ minQty: '1', price: '2' }])).toBe(false) // minQty < 2
      expect(
        bad([
          { minQty: '6', price: '2' },
          { minQty: '6', price: '1' },
        ]),
      ).toBe(false) // repetida
      expect(
        bad([
          { minQty: '6', price: '2' },
          { minQty: '12', price: '2.50' },
        ]),
      ).toBe(false) // precio no decrece
      expect(
        bad(
          Array.from({ length: 6 }, (_, i) => ({
            minQty: String(2 + i),
            price: String(3 - i * 0.5),
          })),
        ),
      ).toBe(false)
      expect(bad(ok)).toBe(true)
    })
  })

  it('categoría vacía = sin categoría', () => {
    expect(productInputSchema.parse({ ...valid, categoryName: '  ' }).categoryName).toBeNull()
  })

  it('acepta código de barras alfanumérico', () => {
    expect(productInputSchema.parse({ ...valid, barcode: ' 7750182000 ' }).barcode).toBe(
      '7750182000',
    )
  })

  it.each([
    ['name', { name: 'A' }],
    ['name', { name: 'x'.repeat(81) }],
    ['barcode', { barcode: 'ab-12' }],
    ['priceCents', { priceCents: '-1' }],
    ['priceCents', { priceCents: '' }],
    ['priceCents', { priceCents: '3.999' }],
    ['categoryName', { categoryName: 'A' }],
    ['categoryName', { categoryName: 'x'.repeat(41) }],
    ['initialStock', { initialStock: '-3' }],
    ['initialStock', { initialStock: '1.5' }],
    ['minStock', { minStock: 'abc' }],
  ])('rechaza %s inválido', (field, patch) => {
    const r = productInputSchema.safeParse({ ...valid, ...patch })
    expect(r.success).toBe(false)
    expect(r.error?.issues.some((i) => i.path[0] === field)).toBe(true)
  })
})

describe('categoryNameSchema', () => {
  it('recorta y valida longitud', () => {
    expect(categoryNameSchema.parse('  Bebidas ')).toBe('Bebidas')
    expect(categoryNameSchema.safeParse('a').success).toBe(false)
  })
})
