import { formatCents } from '@/lib/format'
import type { PriceTier } from '@/lib/pricing'

/** "Desde 6: S/ 2.50" con el nivel más barato (el de mayor cantidad); null si no hay niveles. */
export function tiersHint(tiers: readonly PriceTier[]): string | null {
  const best = tiers.reduce<PriceTier | null>(
    (acc, t) => (!acc || t.unitPriceCents < acc.unitPriceCents ? t : acc),
    null,
  )
  return best ? `Desde ${best.minQty}: ${formatCents(best.unitPriceCents)}` : null
}
