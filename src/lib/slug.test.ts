import { describe, expect, it } from 'vitest'
import { slugify } from './slug'

describe('slugify', () => {
  it('quita tildes, pasa a minúsculas y une con guiones', () => {
    expect(slugify('Bodega San Martín')).toBe('bodega-san-martin')
    expect(slugify('  Minimarket "Ñandú" & Hijos  ')).toBe('minimarket-nandu-hijos')
  })
  it('devuelve vacío si no queda nada utilizable', () => {
    expect(slugify('***')).toBe('')
  })
})
