import { describe, expect, it } from 'vitest'
import { normalizeStoreSlug, validateStoreSlug } from './store-slug'

describe('validateStoreSlug', () => {
  it.each(['mi-bodega', 'bodega1', 'abc', 'a-b', 'a'.repeat(40)])('%s es válido', (s) => {
    expect(validateStoreSlug(s)).toBeNull()
  })

  it.each([
    '',
    'ab',
    '-abc',
    'abc-',
    'a--b',
    'Mi-Bodega',
    'mi bodega',
    'añ-b',
    'a/b',
    'a.b',
    'a'.repeat(41),
  ])('"%s" es inválido', (s) => {
    expect(validateStoreSlug(s)).not.toBeNull()
  })

  it.each(['admin', 'api', 'tienda', 'caja', 'login', 'ventalia', 'www'])(
    '%s está reservado',
    (s) => {
      expect(validateStoreSlug(s)).toBe('Esa dirección está reservada')
    },
  )

  it('normaliza a minúsculas sin espacios en los extremos', () => {
    expect(normalizeStoreSlug('  Mi-Bodega ')).toBe('mi-bodega')
  })
})
