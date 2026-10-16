import { describe, expect, it } from 'vitest'
import { nameKey, normalizeDisplayName } from './name-key'

describe('normalizeDisplayName', () => {
  it('recorta, colapsa espacios y normaliza a NFC', () => {
    expect(normalizeDisplayName('  Inca \t Kola\n500   ml ')).toBe('Inca Kola 500 ml')
    expect(normalizeDisplayName('Café')).toBe('Café')
  })

  it('conserva mayúsculas y tildes', () => {
    expect(normalizeDisplayName(' Lácteos ')).toBe('Lácteos')
  })

  it('cadena vacía', () => {
    expect(normalizeDisplayName('')).toBe('')
    expect(normalizeDisplayName('   ')).toBe('')
  })
})

describe('nameKey', () => {
  it('ignora mayúsculas y espacios', () => {
    const keys = ['Hogar', 'hogar', 'HOGAR', ' hogar  '].map(nameKey)
    expect(new Set(keys)).toEqual(new Set(['hogar']))
  })

  it('ignora tildes y diéresis', () => {
    expect(nameKey('Lácteos')).toBe('lacteos')
    expect(nameKey('LÁCTEOS')).toBe('lacteos')
    expect(nameKey('Lacteos')).toBe('lacteos')
    expect(nameKey('pingüino')).toBe('pinguino')
    expect(nameKey('Pingüino')).toBe(nameKey('PINGUINO'))
  })

  it('la ñ es otra letra', () => {
    expect(nameKey('Año')).not.toBe(nameKey('Ano'))
    expect(nameKey('Año')).toBe('año')
    expect(nameKey('Ñandú')).toBe(nameKey('ñandu'))
    expect(nameKey('Ñandú')).toBe('ñandu')
  })

  it('la ñ descompuesta (n + tilde combinante) equivale a la ñ compuesta', () => {
    expect(nameKey('Año')).toBe(nameKey('Año'))
    expect(nameKey('Cáfe')).toBe('cafe')
  })

  it('nombres de producto', () => {
    expect(nameKey('Inca  Kola 500 ml')).toBe(nameKey('inca kola 500 ML'))
    expect(nameKey('Pan francés')).toBe(nameKey('PAN FRANCES'))
  })

  it('no confunde nombres distintos', () => {
    expect(nameKey('Inca Kola 500 ml')).not.toBe(nameKey('Inca Kola 1.5 L'))
    expect(nameKey('Sal')).not.toBe(nameKey('Sol'))
  })

  it('emoji y otros alfabetos no revientan', () => {
    expect(nameKey('Pan 🥖')).toBe('pan 🥖')
    expect(nameKey('日本茶')).toBe('日本茶')
    expect(nameKey('Привет')).toBe('привет')
  })

  it('cadena vacía', () => {
    expect(nameKey('')).toBe('')
    expect(nameKey('  ')).toBe('')
  })

  it('es idempotente', () => {
    for (const s of ['Lácteos', 'Año', ' Inca  Kola ', 'Ñandú', 'Pan 🥖']) {
      expect(nameKey(nameKey(s))).toBe(nameKey(s))
    }
  })
})
