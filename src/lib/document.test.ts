import { describe, expect, it } from 'vitest'
import { formatDocument, isValidRuc, normalizeDocument, validateDocument } from './document'

describe('normalizeDocument', () => {
  it('quita espacios y guiones y pasa a mayúsculas', () => {
    expect(normalizeDocument(' 20100047-218 ')).toBe('20100047218')
    expect(normalizeDocument('20 100 047 218')).toBe('20100047218')
    expect(normalizeDocument('ab-12 34')).toBe('AB1234')
    expect(normalizeDocument('')).toBe('')
  })
})

describe('isValidRuc', () => {
  it('acepta un RUC real (dígito verificador SUNAT)', () => {
    expect(isValidRuc('20100047218')).toBe(true)
  })

  it('normaliza espacios y guiones antes de validar', () => {
    expect(isValidRuc('2010 0047-218')).toBe(true)
  })

  it('rechaza un dígito verificador incorrecto', () => {
    expect(isValidRuc('20100047219')).toBe(false)
    expect(isValidRuc('20100047210')).toBe(false)
  })

  it('rechaza un prefijo que no existe aunque la suma cuadre', () => {
    // Mismo cuerpo que 20100047218 con prefijo 30: el verificador no importa, el prefijo sí
    expect(isValidRuc('30100047218')).toBe(false)
    expect(isValidRuc('11111111111')).toBe(false)
  })

  it('rechaza largo incorrecto y caracteres no numéricos', () => {
    expect(isValidRuc('2010004721')).toBe(false)
    expect(isValidRuc('201000472180')).toBe(false)
    expect(isValidRuc('2010004721A')).toBe(false)
    expect(isValidRuc('')).toBe(false)
  })

  it('maneja los restos 10 y 11 del módulo (verificador 0 y 1)', () => {
    // Construidos con la regla: r = 11 - (suma % 11); 10 -> 0, 11 -> 1
    const build = (body: string) => {
      const sum = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2].reduce((a, w, i) => a + w * Number(body[i]), 0)
      const r = 11 - (sum % 11)
      return `${body}${r === 10 ? 0 : r === 11 ? 1 : r}`
    }
    let sawZero = false
    let sawOne = false
    for (let n = 0; n < 400 && !(sawZero && sawOne); n++) {
      const ruc = build(`20${String(n).padStart(8, '0')}`)
      expect(isValidRuc(ruc)).toBe(true)
      if (ruc.endsWith('0')) sawZero = true
      if (ruc.endsWith('1')) sawOne = true
    }
    expect(sawZero && sawOne).toBe(true)
  })
})

describe('validateDocument', () => {
  it('DNI: exactamente 8 dígitos', () => {
    expect(validateDocument('dni', '12345678')).toBeNull()
    expect(validateDocument('dni', '1234 5678')).toBeNull()
    expect(validateDocument('dni', '1234567')).toMatch(/8 dígitos/)
    expect(validateDocument('dni', '123456789')).toMatch(/8 dígitos/)
    expect(validateDocument('dni', '1234567A')).toMatch(/8 dígitos/)
  })

  it('CE: 9 a 12 caracteres alfanuméricos', () => {
    expect(validateDocument('ce', '123456789')).toBeNull()
    expect(validateDocument('ce', 'ab1234567890')).toBeNull()
    expect(validateDocument('ce', '12345678')).toMatch(/9 y 12/)
    expect(validateDocument('ce', 'A1234567890123')).toMatch(/9 y 12/)
    expect(validateDocument('ce', 'AB12345!9')).toMatch(/9 y 12/)
  })

  it('RUC: largo, prefijo y dígito verificador con mensajes distintos', () => {
    expect(validateDocument('ruc', '20100047218')).toBeNull()
    expect(validateDocument('ruc', '20100047-218')).toBeNull()
    expect(validateDocument('ruc', '2010004721')).toMatch(/11 dígitos/)
    expect(validateDocument('ruc', '30100047218')).toMatch(/empezar con/)
    expect(validateDocument('ruc', '20100047219')).toMatch(/no es válido/)
  })
})

describe('formatDocument', () => {
  it('antepone el tipo', () => {
    expect(formatDocument('dni', '12345678')).toBe('DNI 12345678')
    expect(formatDocument('ruc', '20100047218')).toBe('RUC 20100047218')
    expect(formatDocument('ce', 'AB1234567')).toBe('CE AB1234567')
  })
})
