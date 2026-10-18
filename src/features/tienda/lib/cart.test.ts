import { describe, expect, it } from 'vitest'
import {
  addToCart,
  cartStorageKey,
  parseStoredCart,
  reconcileCart,
  removeFromCart,
  setCartQty,
} from './cart'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('parseStoredCart', () => {
  it('lee entradas válidas y descarta basura', () => {
    const raw = JSON.stringify([
      { productId: id(1), qty: 2, priceCents: 1 },
      { productId: id(1), qty: 5 },
      { productId: 'x', qty: 1 },
      { productId: id(2), qty: '3' },
      null,
      { productId: id(3), qty: 99999 },
      { productId: id(4), qty: -4 },
    ])
    expect(parseStoredCart(raw)).toEqual([
      { productId: id(1), qty: 2 },
      { productId: id(3), qty: 999 },
      { productId: id(4), qty: 1 },
    ])
  })

  it('JSON roto, no-array o vacío = carrito vacío', () => {
    expect(parseStoredCart(null)).toEqual([])
    expect(parseStoredCart('{no')).toEqual([])
    expect(parseStoredCart('{"a":1}')).toEqual([])
  })

  it('solo conserva productId y qty (jamás precios guardados)', () => {
    const [entry] = parseStoredCart(JSON.stringify([{ productId: id(1), qty: 1, price: 1 }]))
    expect(Object.keys(entry)).toEqual(['productId', 'qty'])
  })

  it('tope de 50 líneas', () => {
    const raw = JSON.stringify(Array.from({ length: 80 }, (_, i) => ({ productId: id(i), qty: 1 })))
    expect(parseStoredCart(raw)).toHaveLength(50)
  })
})

describe('operaciones del carrito', () => {
  it('reconcile quita productos que ya no están', () => {
    const entries = [
      { productId: id(1), qty: 1 },
      { productId: id(2), qty: 1 },
    ]
    expect(reconcileCart(entries, new Set([id(2)]))).toEqual([{ productId: id(2), qty: 1 }])
  })

  it('add suma, respeta 999 y 50 líneas', () => {
    let c = addToCart([], id(1), 998)
    c = addToCart(c, id(1), 5)
    expect(c).toEqual([{ productId: id(1), qty: 999 }])
    const full = Array.from({ length: 50 }, (_, i) => ({ productId: id(i + 10), qty: 1 }))
    expect(addToCart(full, id(1))).toHaveLength(50)
  })

  it('setQty acota 1..999 y remove quita', () => {
    const c = [{ productId: id(1), qty: 3 }]
    expect(setCartQty(c, id(1), 0)[0].qty).toBe(1)
    expect(setCartQty(c, id(1), 5000)[0].qty).toBe(999)
    expect(removeFromCart(c, id(1))).toEqual([])
  })

  it('clave de storage por tienda, en minúsculas', () => {
    expect(cartStorageKey('Mi-Bodega')).toBe('ventalia:tienda:mi-bodega:cart')
  })
})
