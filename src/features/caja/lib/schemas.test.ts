import { describe, expect, it } from 'vitest'
import { checkoutInputSchema } from './schemas'

const ID = '0b6f2d3e-5c1a-4f7e-9a3b-1c2d3e4f5a6b'
const valid = { saleId: ID, paymentMethod: 'efectivo', items: [{ productId: ID, quantity: 2 }] }

describe('checkoutInputSchema', () => {
  it('acepta una venta válida', () => {
    expect(checkoutInputSchema.safeParse(valid).success).toBe(true)
  })

  it('rechaza carrito vacío, cantidades inválidas y métodos desconocidos', () => {
    const bad = (over: object) => checkoutInputSchema.safeParse({ ...valid, ...over }).success
    expect(bad({ items: [] })).toBe(false)
    expect(bad({ items: [{ productId: ID, quantity: 0 }] })).toBe(false)
    expect(bad({ items: [{ productId: ID, quantity: 1000 }] })).toBe(false)
    expect(bad({ items: [{ productId: ID, quantity: 1.5 }] })).toBe(false)
    expect(bad({ paymentMethod: 'cripto' })).toBe(false)
    expect(bad({ saleId: 'no-uuid' })).toBe(false)
  })

  it('customerId es opcional (público general) y, si viene, debe ser un uuid', () => {
    const ok = (over: object) => checkoutInputSchema.safeParse({ ...valid, ...over }).success
    expect(ok({ customerId: ID })).toBe(true)
    expect(ok({ customerId: null })).toBe(true)
    expect(ok({ customerId: undefined })).toBe(true)
    expect(ok({ customerId: 'juan' })).toBe(false)
    expect(ok({ customerId: '' })).toBe(false)
  })

  it('descarta campos que el cliente no debe decidir (precio, bodega, usuario)', () => {
    const parsed = checkoutInputSchema.parse({
      ...valid,
      organizationId: 'otra',
      items: [{ productId: ID, quantity: 1, priceCents: 1 }],
    })
    expect(parsed).not.toHaveProperty('organizationId')
    expect(parsed.items[0]).not.toHaveProperty('priceCents')
  })
})
