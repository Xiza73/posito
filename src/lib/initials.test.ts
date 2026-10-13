import { describe, expect, it } from 'vitest'
import { initials } from './initials'

describe('initials', () => {
  it('toma la primera letra del primer y último nombre', () => {
    expect(initials('Ana Rojas')).toBe('AR')
    expect(initials('  juan  carlos pérez ')).toBe('JP')
  })
  it('con un solo nombre usa dos letras', () => {
    expect(initials('Ana')).toBe('AN')
  })
  it('con vacío devuelve ?', () => {
    expect(initials('  ')).toBe('?')
  })
})
