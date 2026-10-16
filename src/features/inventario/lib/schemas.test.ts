import { describe, expect, it } from 'vitest'
import {
  adjustInputSchema,
  batchIngresoInputSchema,
  countInputSchema,
  ingresoInputSchema,
  MAX_BATCH_LINES,
} from './schemas'

const ID = '5f0f5a6e-2c0e-4a39-9d57-0f0a8d8f3b11'

describe('ingresoInputSchema', () => {
  it('produce una línea y nota null si viene vacía', () => {
    expect(ingresoInputSchema.parse({ productId: ID, quantity: ' 12 ', note: '  ' })).toEqual({
      lines: [{ productId: ID, quantity: 12 }],
      note: null,
    })
  })

  it('conserva la nota recortada', () => {
    const r = ingresoInputSchema.parse({ productId: ID, quantity: '3', note: ' Backus, f. 123 ' })
    expect(r.note).toBe('Backus, f. 123')
  })

  it.each(['0', '-2', '1.5', 'abc', '', '1000001'])('rechaza cantidad %j', (q) => {
    expect(ingresoInputSchema.safeParse({ productId: ID, quantity: q }).success).toBe(false)
  })

  it('rechaza nota de más de 200 caracteres', () => {
    expect(
      ingresoInputSchema.safeParse({ productId: ID, quantity: '1', note: 'x'.repeat(201) }).success,
    ).toBe(false)
  })
})

describe('batchIngresoInputSchema', () => {
  it('acepta hasta 200 líneas y rechaza 0 o 201', () => {
    const line = { productId: ID, quantity: 1 }
    expect(batchIngresoInputSchema.safeParse({ lines: [line] }).success).toBe(true)
    expect(
      batchIngresoInputSchema.safeParse({ lines: Array(MAX_BATCH_LINES).fill(line) }).success,
    ).toBe(true)
    expect(
      batchIngresoInputSchema.safeParse({ lines: Array(MAX_BATCH_LINES + 1).fill(line) }).success,
    ).toBe(false)
    expect(batchIngresoInputSchema.safeParse({ lines: [] }).success).toBe(false)
  })

  it('rechaza cantidades no enteras o no positivas', () => {
    for (const quantity of [0, -1, 1.5]) {
      expect(
        batchIngresoInputSchema.safeParse({ lines: [{ productId: ID, quantity }] }).success,
      ).toBe(false)
    }
  })
})

describe('adjustInputSchema', () => {
  const base = { productId: ID, direction: 'restar', quantity: '4', reasonCode: 'merma' }

  it('restar produce delta negativo y el texto del motivo de la lista', () => {
    expect(adjustInputSchema.parse(base)).toEqual({ productId: ID, delta: -4, reason: 'Merma' })
  })

  it('sumar produce delta positivo', () => {
    expect(adjustInputSchema.parse({ ...base, direction: 'sumar' }).delta).toBe(4)
  })

  it('"Otro" exige texto de 5 a 200 y se guarda como "Otro: …"', () => {
    expect(adjustInputSchema.safeParse({ ...base, reasonCode: 'otro' }).success).toBe(false)
    expect(
      adjustInputSchema.safeParse({ ...base, reasonCode: 'otro', otherText: 'abc' }).success,
    ).toBe(false)
    expect(
      adjustInputSchema.safeParse({ ...base, reasonCode: 'otro', otherText: 'x'.repeat(201) })
        .success,
    ).toBe(false)
    expect(
      adjustInputSchema.parse({ ...base, reasonCode: 'otro', otherText: ' Se cayó la caja ' })
        .reason,
    ).toBe('Otro: Se cayó la caja')
  })

  it('ignora el texto libre si el motivo no es "Otro" (no confía en el cliente)', () => {
    expect(adjustInputSchema.parse({ ...base, otherText: 'inventado' }).reason).toBe('Merma')
  })

  it('rechaza motivo desconocido, dirección inválida y cantidad 0', () => {
    expect(adjustInputSchema.safeParse({ ...base, reasonCode: 'regalo' }).success).toBe(false)
    expect(adjustInputSchema.safeParse({ ...base, direction: 'x' }).success).toBe(false)
    expect(adjustInputSchema.safeParse({ ...base, quantity: '0' }).success).toBe(false)
  })
})

describe('countInputSchema', () => {
  it('acepta 0 como cantidad contada', () => {
    expect(countInputSchema.parse({ productId: ID, counted: '0' })).toEqual({
      productId: ID,
      counted: 0,
      note: null,
    })
  })

  it.each(['-1', '2.5', '', 'x'])('rechaza %j', (counted) => {
    expect(countInputSchema.safeParse({ productId: ID, counted }).success).toBe(false)
  })
})
