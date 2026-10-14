import { describe, expect, it } from 'vitest'
import { formatReceiptNumber } from './receipt'

describe('formatReceiptNumber', () => {
  it('rellena con ceros hasta 5 dígitos', () => {
    expect(formatReceiptNumber('B001', 1)).toBe('B001-00001')
    expect(formatReceiptNumber('B001', 38)).toBe('B001-00038')
  })

  it('no recorta números más largos', () => {
    expect(formatReceiptNumber('B002', 123456)).toBe('B002-123456')
  })
})
