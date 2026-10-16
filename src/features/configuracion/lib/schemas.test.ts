import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { businessProfileSchema, receiptSeriesSchema, settingsSchema } from './schemas'

const parse = (series: string, nextNumber: string) =>
  receiptSeriesSchema.safeParse({ series, nextNumber })

describe('receiptSeriesSchema', () => {
  it('normaliza la serie a mayúsculas y el número a entero', () => {
    expect(parse(' b002 ', '38')).toMatchObject({
      success: true,
      data: { series: 'B002', nextNumber: 38 },
    })
  })

  it('rechaza series que no son de boleta', () => {
    for (const s of ['F001', 'B01', 'B0001', 'BBBB', '']) expect(parse(s, '1').success).toBe(false)
  })

  it('rechaza números fuera de rango o no enteros', () => {
    for (const n of ['0', '-1', '1.5', 'abc', '', '100000000']) {
      expect(parse('B001', n).success).toBe(false)
    }
    expect(parse('B001', '99999999').success).toBe(true)
  })
})

describe('settingsSchema', () => {
  it('acepta un booleano y rechaza cualquier otra cosa', () => {
    expect(settingsSchema.safeParse({ requireSaleApproval: true }).success).toBe(true)
    expect(settingsSchema.safeParse({ requireSaleApproval: false }).success).toBe(true)
    expect(settingsSchema.safeParse({ requireSaleApproval: 'on' }).success).toBe(false)
    expect(settingsSchema.safeParse({}).success).toBe(false)
  })
})

describe('businessProfileSchema', () => {
  const base = {
    tradeName: 'Bodega San Martín',
    legalName: '',
    ruc: '',
    address: '',
    phone: '',
    branchName: '',
    receiptFooter: '',
  }
  const parse = (over: Record<string, string> = {}) =>
    businessProfileSchema.safeParse({ ...base, ...over })
  const errorsOf = (over: Record<string, string>) => {
    const r = parse(over)
    return r.success ? {} : z.flattenError(r.error).fieldErrors
  }

  it('solo el nombre comercial es obligatorio; lo vacío queda en null', () => {
    expect(parse()).toMatchObject({
      success: true,
      data: { tradeName: 'Bodega San Martín', legalName: null, ruc: null, receiptFooter: null },
    })
    expect(parse({ tradeName: '' }).success).toBe(false)
    expect(parse({ tradeName: 'A' }).success).toBe(false)
  })

  it('normaliza espacios', () => {
    expect(parse({ tradeName: '  Bodega   San   Martín ' })).toMatchObject({
      data: { tradeName: 'Bodega San Martín' },
    })
  })

  it('un RUC con dígito verificador inválido se rechaza', () => {
    expect(errorsOf({ ruc: '20100047219', legalName: 'X S.A.C.' }).ruc).toBeDefined()
    expect(errorsOf({ ruc: '123', legalName: 'X S.A.C.' }).ruc).toBeDefined()
  })

  it('la razón social es obligatoria si hay RUC', () => {
    expect(errorsOf({ ruc: '20100047218' }).legalName).toBeDefined()
    expect(parse({ ruc: '20100047218', legalName: 'Estrella S.A.C.' })).toMatchObject({
      success: true,
    })
  })

  it('normaliza el RUC (sin espacios ni guiones)', () => {
    expect(parse({ ruc: '2010 0047-218', legalName: 'Estrella S.A.C.' })).toMatchObject({
      data: { ruc: '20100047218' },
    })
  })

  it('rechaza caracteres de control y de formato en cualquier campo de texto', () => {
    for (const field of [
      'tradeName',
      'legalName',
      'address',
      'phone',
      'branchName',
      'receiptFooter',
    ]) {
      for (const bad of ['Hola\u0000mundo', 'Hola\u200Bmundo', 'Hola\u202Emundo', 'Hola\nmundo']) {
        expect(parse({ [field]: bad }).success, `${field} ${JSON.stringify(bad)}`).toBe(false)
      }
    }
  })

  it('respeta los largos máximos', () => {
    expect(parse({ tradeName: 'a'.repeat(81) }).success).toBe(false)
    expect(parse({ address: 'a'.repeat(201) }).success).toBe(false)
    expect(parse({ phone: '1'.repeat(31) }).success).toBe(false)
    expect(parse({ branchName: 'a'.repeat(61) }).success).toBe(false)
    expect(parse({ receiptFooter: 'a'.repeat(121) }).success).toBe(false)
    expect(parse({ legalName: 'a'.repeat(121) }).success).toBe(false)
    expect(parse({ tradeName: 'a'.repeat(80), address: 'a'.repeat(200) }).success).toBe(true)
  })
})
