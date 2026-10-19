import { describe, expect, it } from 'vitest'
import { tiersHint } from './tiers-hint'

describe('tiersHint', () => {
  it('muestra el nivel más barato', () => {
    expect(
      tiersHint([
        { minQty: 6, unitPriceCents: 270 },
        { minQty: 12, unitPriceCents: 250 },
      ]),
    ).toMatch(/^Desde 12: S\/\s2\.50$/)
  })

  it('sin niveles = null', () => {
    expect(tiersHint([])).toBeNull()
  })
})
