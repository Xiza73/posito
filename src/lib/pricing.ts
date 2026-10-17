// Precio por mayor: "desde N unidades -> precio por unidad". Lógica pura compartida entre la caja
// (solo para mostrar), Productos (validación) y el cobro (autoridad: el servidor la recalcula).
// Todo en céntimos enteros.

/** Valores de `sale_item.price_source` (text + CHECK, no enum: ver CLAUDE.md §7). */
export type PriceSource = 'normal' | 'mayor' | 'manual'

export type PriceTier = { minQty: number; unitPriceCents: number }

export const MAX_TIERS = 5
export const MIN_TIER_QTY = 2
/** Mismo tope que la cantidad máxima por producto en la caja (features/caja/lib/schemas.ts). */
export const MAX_TIER_QTY = 999

export type UnitPrice = {
  unitPriceCents: number
  source: PriceSource
  /** Nivel aplicado (solo si `source === 'mayor'`). */
  tier?: { minQty: number }
}

/**
 * Precio unitario efectivo para `qty` unidades: gana el nivel MÁS ALTO cuyo `minQty <= qty` y se
 * aplica a TODAS las unidades de la línea. Por debajo del primer nivel rige el precio normal.
 * Un nivel que no abarata (precio >= normal) se ignora: "por mayor" nunca sube el precio.
 */
export function unitPriceFor(
  input: { basePriceCents: number; tiers: readonly PriceTier[] },
  qty: number,
): UnitPrice {
  let best: PriceTier | null = null
  for (const t of input.tiers) {
    if (t.minQty > qty || t.unitPriceCents >= input.basePriceCents) continue
    if (!best || t.minQty > best.minQty) best = t
  }
  if (!best) return { unitPriceCents: input.basePriceCents, source: 'normal' }
  return { unitPriceCents: best.unitPriceCents, source: 'mayor', tier: { minQty: best.minQty } }
}

/**
 * Valida los niveles de un producto (en el orden en que se escriben). Devuelve mensajes en español
 * listos para mostrar; vacío = válidos. Reglas: máx. 5, `minQty` entero >= 2, cantidades
 * estrictamente crecientes (sin repetidas), cada precio < precio normal y < el del nivel anterior.
 */
export function validateTiers(basePriceCents: number, tiers: readonly PriceTier[]): string[] {
  const errors: string[] = []
  if (tiers.length > MAX_TIERS) {
    errors.push(`Máximo ${MAX_TIERS} niveles de precio por mayor`)
  }
  tiers.forEach((t, i) => {
    const n = i + 1
    if (!Number.isInteger(t.minQty) || t.minQty < MIN_TIER_QTY || t.minQty > MAX_TIER_QTY) {
      errors.push(`Nivel ${n}: "Desde" debe ser un entero entre ${MIN_TIER_QTY} y ${MAX_TIER_QTY}`)
    }
    if (!Number.isInteger(t.unitPriceCents) || t.unitPriceCents < 1) {
      errors.push(`Nivel ${n}: el precio debe ser de S/ 0.01 o más`)
    } else if (t.unitPriceCents >= basePriceCents) {
      errors.push(`Nivel ${n}: el precio debe ser menor al precio normal`)
    }
    const prev = tiers[i - 1]
    if (prev) {
      if (t.minQty === prev.minQty) {
        errors.push(`Nivel ${n}: la cantidad "Desde" está repetida`)
      } else if (t.minQty < prev.minQty) {
        errors.push(`Nivel ${n}: las cantidades deben ir en aumento`)
      }
      if (t.unitPriceCents >= prev.unitPriceCents) {
        errors.push(`Nivel ${n}: el precio debe ser menor al del nivel anterior`)
      }
    }
  })
  return errors
}

export type ResolvedLine = {
  /** Con `source === 'manual'` es INFORMATIVO: `floor(total / qty)`; el importe real es `lineTotalCents`. */
  unitPriceCents: number
  lineTotalCents: number
  source: PriceSource
  /** Nivel aplicado (solo si `source === 'mayor'`). */
  tier?: { minQty: number }
}

/**
 * Precio de una línea. Un total manual (editado en la Caja) REEMPLAZA al precio normal y al por
 * mayor: el importe es lo escrito y el unitario se guarda como `floor(total / qty)` solo a modo
 * informativo (la línea ya no cumple `unit × qty = total`, por eso el CHECK exceptúa 'manual').
 */
export function resolveLine(
  input: { basePriceCents: number; tiers: readonly PriceTier[] },
  qty: number,
  manualTotalCents?: number | null,
): ResolvedLine {
  const auto = unitPriceFor(input, qty)
  const autoTotal = auto.unitPriceCents * qty
  const automatic: ResolvedLine = { ...auto, lineTotalCents: autoTotal }
  if (manualTotalCents === undefined || manualTotalCents === null) return automatic
  // Normalización: un "total manual" igual al automático no es una edición; se cobra como
  // normal/mayor para no marcar ventas como editadas sin diferencia real.
  if (manualTotalCents === autoTotal) return automatic
  return {
    unitPriceCents: Math.floor(manualTotalCents / qty),
    lineTotalCents: manualTotalCents,
    source: 'manual',
  }
}
