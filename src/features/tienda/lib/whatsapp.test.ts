import { describe, expect, it } from 'vitest'
import { formatCents } from '@/lib/format'
import {
  buildOrderMessage,
  clampQty,
  orderTotalCents,
  priceLine,
  sanitizeText,
  whatsappUrl,
} from './whatsapp'

const inca = {
  name: 'Inca Kola',
  qty: 2,
  basePriceCents: 300,
  tiers: [{ minQty: 6, unitPriceCents: 250 }],
}
const customer = { name: 'Ana Rojas', mode: 'recojo' as const }

describe('priceLine', () => {
  it('aplica el nivel por mayor a toda la línea', () => {
    expect(priceLine({ ...inca, qty: 5 })).toMatchObject({
      unitPriceCents: 300,
      lineTotalCents: 1500,
      wholesale: false,
    })
    expect(priceLine({ ...inca, qty: 6 })).toMatchObject({
      unitPriceCents: 250,
      lineTotalCents: 1500,
      wholesale: true,
    })
  })

  it('acota la cantidad a 1..999 enteros', () => {
    expect(clampQty(0)).toBe(1)
    expect(clampQty(2.9)).toBe(2)
    expect(clampQty(5000)).toBe(999)
    expect(clampQty(Number.NaN)).toBe(1)
  })
})

describe('buildOrderMessage', () => {
  it('incluye cliente, modalidad, productos con precio unitario, "(por mayor)" y total', () => {
    const { text, totalCents } = buildOrderMessage({
      storeName: 'Don Pepe',
      lines: [inca, { ...inca, name: 'Galleta', qty: 6 }],
      customer: { ...customer, note: 'Sin bolsa' },
    })
    expect(totalCents).toBe(600 + 1500)
    expect(text).toContain('Don Pepe')
    expect(text).toContain('Cliente: Ana Rojas')
    expect(text).toContain('Modalidad: Recojo en tienda')
    expect(text).toContain('Nota: Sin bolsa')
    expect(text).toContain(`2 x Inca Kola - ${formatCents(300)} c/u = ${formatCents(600)}`)
    expect(text).toContain(
      `6 x Galleta - ${formatCents(250)} c/u (por mayor) = ${formatCents(1500)}`,
    )
    expect(text).toContain(`Total: ${formatCents(2100)}`)
    expect(text).not.toMatch(/Dirección/)
  })

  it('no menciona precios referenciales (precios fijos del catálogo)', () => {
    const { text } = buildOrderMessage({ storeName: 'X', lines: [inca], customer })
    expect(text.toLowerCase()).not.toContain('referencial')
  })

  it('delivery incluye la dirección', () => {
    const { text } = buildOrderMessage({
      storeName: 'X',
      lines: [inca],
      customer: { name: 'Ana', mode: 'delivery', address: 'Av. Lima 123' },
    })
    expect(text).toContain('Modalidad: Delivery')
    expect(text).toContain('Dirección: Av. Lima 123')
  })

  it('sanitiza: controles, formato de WhatsApp y topes de largo', () => {
    const { text } = buildOrderMessage({
      storeName: 'X',
      lines: [inca],
      customer: {
        name: `*Ana*‮\n_Rojas_${'x'.repeat(200)}`,
        mode: 'delivery',
        address: 'd'.repeat(500),
        note: 'n'.repeat(900),
      },
    })
    const line = (prefix: string) => text.split('\n').find((l) => l.startsWith(prefix)) ?? ''
    expect(line('Cliente: ').length).toBe('Cliente: '.length + 80)
    expect(line('Cliente: ')).not.toMatch(/[*_‮]/)
    expect(line('Dirección: ').length).toBe('Dirección: '.length + 200)
    expect(line('Nota: ').length).toBe('Nota: '.length + 300)
  })

  it('acorta la lista pero conserva el total cuando es demasiado larga', () => {
    const lines = Array.from({ length: 50 }, (_, i) => ({
      ...inca,
      name: `Producto con nombre bastante largo número ${i}`,
      qty: 1,
    }))
    const { text, truncated, totalCents } = buildOrderMessage({
      storeName: 'X',
      lines,
      customer,
      maxEncoded: 1800,
    })
    expect(truncated).toBe(true)
    expect(encodeURIComponent(text).length).toBeLessThanOrEqual(1800)
    expect(text).toMatch(/…y \d+ productos más/)
    expect(totalCents).toBe(50 * 300)
    expect(text).toContain(`Total: ${formatCents(50 * 300)}`)
  })

  it('un pedido corto no se acorta', () => {
    expect(buildOrderMessage({ storeName: 'X', lines: [inca], customer }).truncated).toBe(false)
  })

  it('el total ignora más de 50 líneas, igual que el mensaje', () => {
    const many = Array.from({ length: 60 }, () => ({ ...inca, qty: 1 }))
    expect(orderTotalCents(many)).toBe(50 * 300)
  })
})

describe('whatsappUrl / sanitizeText', () => {
  it('codifica el texto', () => {
    expect(whatsappUrl('51987654321', 'Hola & chau\nok')).toBe(
      'https://wa.me/51987654321?text=Hola%20%26%20chau%0Aok',
    )
  })

  it('colapsa espacios', () => {
    expect(sanitizeText('  a \t\n b  ', 10)).toBe('a b')
  })
})
