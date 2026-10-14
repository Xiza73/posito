import { describe, expect, it } from 'vitest'
import { isNextControlFlow, uniqueViolation } from './errors'

describe('uniqueViolation', () => {
  it('lee el constraint de postgres.js', () => {
    expect(uniqueViolation({ code: '23505', constraint_name: 'product_org_barcode_uq' })).toBe(
      'product_org_barcode_uq',
    )
  })

  it('lee el constraint de PGlite', () => {
    expect(uniqueViolation({ code: '23505', constraint: 'category_org_name_uq' })).toBe(
      'category_org_name_uq',
    )
  })

  it('atraviesa el cause con el que Drizzle envuelve el error', () => {
    const wrapped = new Error('Failed query', { cause: { code: '23505', constraint_name: 'x' } })
    expect(uniqueViolation(wrapped)).toBe('x')
  })

  it('ignora otros errores', () => {
    expect(uniqueViolation(new Error('boom'))).toBeNull()
    expect(uniqueViolation({ code: '23514' })).toBeNull()
    expect(uniqueViolation(null)).toBeNull()
  })
})

describe('isNextControlFlow', () => {
  it('detecta errores NEXT_*', () => {
    expect(isNextControlFlow({ digest: 'NEXT_REDIRECT;/login' })).toBe(true)
    expect(isNextControlFlow(new Error('x'))).toBe(false)
  })
})
