import { describe, expect, it } from 'vitest'
import { receiptSeriesSchema, settingsSchema } from './schemas'

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
