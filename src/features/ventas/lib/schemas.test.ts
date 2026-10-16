import { describe, expect, it } from 'vitest'
import { voidInputSchema } from './schemas'

const id = '3f2b8c1e-5d7a-4b9e-8c11-2a6f0d9e4b73'
const parse = (v: unknown) => voidInputSchema.safeParse(v)

describe('voidInputSchema', () => {
  it('traduce cada código al texto de la opción', () => {
    expect(parse({ id, reasonCode: 'error_cobro' }).data).toEqual({
      id,
      reason: 'Error de cobro',
    })
    expect(parse({ id, reasonCode: 'devolucion' }).data?.reason).toBe(
      'Cliente devolvió los productos',
    )
    expect(parse({ id, reasonCode: 'producto_equivocado' }).data?.reason).toBe(
      'Producto equivocado',
    )
  })

  it('ignora el texto libre cuando el motivo no es "Otro"', () => {
    expect(parse({ id, reasonCode: 'error_cobro', otherText: 'inyectado' }).data?.reason).toBe(
      'Error de cobro',
    )
  })

  it('"Otro" exige entre 5 y 200 caracteres y se guarda como "Otro: <texto>"', () => {
    expect(parse({ id, reasonCode: 'otro', otherText: '  Se cobró doble  ' }).data?.reason).toBe(
      'Otro: Se cobró doble',
    )
    for (const otherText of ['', '    ', 'abcd', 'x'.repeat(201)]) {
      const r = parse({ id, reasonCode: 'otro', otherText })
      expect(r.success).toBe(false)
    }
    expect(parse({ id, reasonCode: 'otro', otherText: 'x'.repeat(200) }).success).toBe(true)
    expect(parse({ id, reasonCode: 'otro', otherText: 'abcde' }).success).toBe(true)
  })

  it('rechaza ids que no son uuid y motivos desconocidos o ausentes', () => {
    expect(parse({ id: '1', reasonCode: 'error_cobro' }).success).toBe(false)
    expect(parse({ id, reasonCode: 'porque_si' }).success).toBe(false)
    expect(parse({ id }).success).toBe(false)
  })
})
