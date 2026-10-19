import { describe, expect, it } from 'vitest'
import { MAX_TIERS, type PriceTier, resolveLine, unitPriceFor, validateTiers } from './pricing'

const tiers: PriceTier[] = [
  { minQty: 6, unitPriceCents: 250 },
  { minQty: 12, unitPriceCents: 230 },
]
const base = 300

describe('unitPriceFor', () => {
  it('sin niveles rige el precio normal', () => {
    expect(unitPriceFor({ basePriceCents: base, tiers: [] }, 50)).toEqual({
      unitPriceCents: 300,
      source: 'normal',
    })
  })

  it('por debajo del primer nivel rige el normal', () => {
    expect(unitPriceFor({ basePriceCents: base, tiers }, 5)).toEqual({
      unitPriceCents: 300,
      source: 'normal',
    })
    expect(unitPriceFor({ basePriceCents: base, tiers }, 1).source).toBe('normal')
  })

  it('en el minQty exacto ya aplica el nivel', () => {
    expect(unitPriceFor({ basePriceCents: base, tiers }, 6)).toEqual({
      unitPriceCents: 250,
      source: 'mayor',
      tier: { minQty: 6 },
    })
    expect(unitPriceFor({ basePriceCents: base, tiers }, 12).unitPriceCents).toBe(230)
  })

  it('entre niveles aplica el más alto alcanzado a todas las unidades', () => {
    const r = unitPriceFor({ basePriceCents: base, tiers }, 8)
    expect(r.unitPriceCents).toBe(250)
    expect(r.tier).toEqual({ minQty: 6 })
    expect(r.unitPriceCents * 8).toBe(2000)
  })

  it('por encima del último nivel sigue el último', () => {
    expect(unitPriceFor({ basePriceCents: base, tiers }, 999).unitPriceCents).toBe(230)
  })

  it('no depende del orden de los niveles', () => {
    const reversed = [...tiers].reverse()
    expect(unitPriceFor({ basePriceCents: base, tiers: reversed }, 13).unitPriceCents).toBe(230)
  })

  it('un nivel de S/ 0.01 se aplica', () => {
    const r = unitPriceFor({ basePriceCents: base, tiers: [{ minQty: 2, unitPriceCents: 1 }] }, 2)
    expect(r).toMatchObject({ unitPriceCents: 1, source: 'mayor' })
  })

  it('ignora un nivel que no abarata (nunca sube el precio)', () => {
    const r = unitPriceFor({ basePriceCents: 200, tiers: [{ minQty: 2, unitPriceCents: 250 }] }, 5)
    expect(r).toEqual({ unitPriceCents: 200, source: 'normal' })
  })
})

describe('validateTiers', () => {
  it('acepta sin niveles y niveles correctos', () => {
    expect(validateTiers(base, [])).toEqual([])
    expect(validateTiers(base, tiers)).toEqual([])
  })

  it('acepta minQty 2 y precio mínimo S/ 0.01; rechaza precio 0', () => {
    expect(validateTiers(base, [{ minQty: 2, unitPriceCents: 1 }])).toEqual([])
    expect(validateTiers(base, [{ minQty: 2, unitPriceCents: 0 }])).toHaveLength(1)
  })

  it('rechaza minQty < 2, no entero o por encima del máximo', () => {
    expect(validateTiers(base, [{ minQty: 1, unitPriceCents: 100 }])).toHaveLength(1)
    expect(validateTiers(base, [{ minQty: 0, unitPriceCents: 100 }])).toHaveLength(1)
    expect(validateTiers(base, [{ minQty: 2.5, unitPriceCents: 100 }])).toHaveLength(1)
    expect(validateTiers(base, [{ minQty: 1000, unitPriceCents: 100 }])).toHaveLength(1)
  })

  it('rechaza precios iguales o mayores al normal', () => {
    expect(validateTiers(base, [{ minQty: 2, unitPriceCents: 300 }])).toHaveLength(1)
    expect(validateTiers(base, [{ minQty: 2, unitPriceCents: 301 }])).toHaveLength(1)
    expect(validateTiers(base, [{ minQty: 2, unitPriceCents: 299 }])).toEqual([])
  })

  it('rechaza precios negativos o no enteros', () => {
    expect(validateTiers(base, [{ minQty: 2, unitPriceCents: -1 }])).toHaveLength(1)
    expect(validateTiers(base, [{ minQty: 2, unitPriceCents: 10.5 }])).toHaveLength(1)
  })

  it('exige cantidades estrictamente crecientes', () => {
    const rep = validateTiers(base, [
      { minQty: 6, unitPriceCents: 250 },
      { minQty: 6, unitPriceCents: 240 },
    ])
    expect(rep).toHaveLength(1)
    expect(rep[0]).toMatch(/repetida/)
    const desc = validateTiers(base, [
      { minQty: 12, unitPriceCents: 250 },
      { minQty: 6, unitPriceCents: 240 },
    ])
    expect(desc.join()).toMatch(/aumento/)
  })

  it('exige precios estrictamente decrecientes', () => {
    const e = validateTiers(base, [
      { minQty: 6, unitPriceCents: 250 },
      { minQty: 12, unitPriceCents: 250 },
    ])
    expect(e).toHaveLength(1)
    expect(e[0]).toMatch(/anterior/)
    expect(
      validateTiers(base, [
        { minQty: 6, unitPriceCents: 250 },
        { minQty: 12, unitPriceCents: 260 },
      ]),
    ).toHaveLength(1)
  })

  it('permite hasta 5 niveles y rechaza el sexto', () => {
    const make = (n: number): PriceTier[] =>
      Array.from({ length: n }, (_, i) => ({ minQty: 2 + i, unitPriceCents: 290 - i * 10 }))
    expect(validateTiers(base, make(MAX_TIERS))).toEqual([])
    expect(validateTiers(base, make(MAX_TIERS + 1)).join()).toMatch(/Máximo 5/)
  })
})

describe('resolveLine', () => {
  const input = { basePriceCents: 300, tiers }

  it('sin total manual usa el precio automático (normal o por mayor)', () => {
    expect(resolveLine(input, 2)).toEqual({
      unitPriceCents: 300,
      lineTotalCents: 600,
      source: 'normal',
    })
    expect(resolveLine(input, 6, null)).toEqual({
      unitPriceCents: 250,
      lineTotalCents: 1500,
      source: 'mayor',
      tier: { minQty: 6 },
    })
  })

  it('el total manual reemplaza al nivel por mayor, hacia arriba o hacia abajo', () => {
    expect(resolveLine(input, 6, 1000)).toEqual({
      unitPriceCents: 166,
      lineTotalCents: 1000,
      source: 'manual',
    })
    expect(resolveLine(input, 6, 2000).lineTotalCents).toBe(2000)
  })

  it('el unitario es floor(total / cantidad): 3 unidades a S/ 10.00 -> 333 y total 1000', () => {
    expect(resolveLine(input, 3, 1000)).toEqual({
      unitPriceCents: 333,
      lineTotalCents: 1000,
      source: 'manual',
    })
  })

  it('un total menor que la cantidad deja unitario 0 (informativo) sin romper el importe', () => {
    expect(resolveLine(input, 5, 3)).toMatchObject({ unitPriceCents: 0, lineTotalCents: 3 })
  })
})

describe('resolveLine: normalización', () => {
  const input = { basePriceCents: 300, tiers }

  it('un total manual igual al automático devuelve el resultado automático (normal)', () => {
    expect(resolveLine(input, 2, 600)).toEqual({
      unitPriceCents: 300,
      lineTotalCents: 600,
      source: 'normal',
    })
  })

  it('un total manual igual al automático por mayor devuelve mayor, no manual', () => {
    expect(resolveLine(input, 6, 1500)).toEqual({
      unitPriceCents: 250,
      lineTotalCents: 1500,
      source: 'mayor',
      tier: { minQty: 6 },
    })
  })

  it('un total distinto al automático sigue siendo manual', () => {
    expect(resolveLine(input, 6, 1501).source).toBe('manual')
  })
})
