import { describe, expect, it } from 'vitest'
import { normalizeWhatsappNumber } from './whatsapp-phone'

describe('normalizeWhatsappNumber', () => {
  it.each([
    ['987654321', '51987654321'],
    ['987 654 321', '51987654321'],
    ['+51 987-654-321', '51987654321'],
    ['51987654321', '51987654321'],
    ['(51) 987 654 321', '51987654321'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeWhatsappNumber(raw)).toBe(expected)
  })

  it.each([
    null,
    undefined,
    '',
    '012345678',
    '887654321',
    '98765432',
    '9876543210',
    '+52987654321',
    '5198765432',
    '01 234 5678',
    '987abc321',
    '++51987654321',
  ])('%s es inválido', (raw) => {
    expect(normalizeWhatsappNumber(raw)).toBeNull()
  })
})
