import { clampQty, MAX_CART_LINES } from './whatsapp'

// Carrito del navegador: SOLO { productId, qty }. Los precios y nombres se toman SIEMPRE del
// catálogo que sirvió el servidor (nunca de lo guardado: localStorage es editable por el visitante).

export type CartEntry = { productId: string; qty: number }

export const cartStorageKey = (slug: string) => `ventalia:tienda:${slug.toLowerCase()}:cart`

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Lee lo guardado con tolerancia total: cualquier cosa rara = se ignora. */
export function parseStoredCart(raw: string | null): CartEntry[] {
  if (!raw) return []
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(data)) return []
  const seen = new Set<string>()
  const out: CartEntry[] = []
  for (const item of data) {
    if (out.length >= MAX_CART_LINES) break
    if (typeof item !== 'object' || item === null) continue
    const { productId, qty } = item as Record<string, unknown>
    if (typeof productId !== 'string' || !UUID_RE.test(productId) || seen.has(productId)) continue
    if (typeof qty !== 'number') continue
    seen.add(productId)
    out.push({ productId, qty: clampQty(qty) })
  }
  return out
}

/** Quita los productos que ya no están en el catálogo visible. */
export function reconcileCart(
  entries: readonly CartEntry[],
  catalogIds: ReadonlySet<string>,
): CartEntry[] {
  return entries.filter((e) => catalogIds.has(e.productId))
}

/** Suma `qty` a la línea (o la crea). Respeta 50 líneas y 1..999 unidades. */
export function addToCart(entries: readonly CartEntry[], productId: string, qty = 1): CartEntry[] {
  const existing = entries.find((e) => e.productId === productId)
  if (existing) {
    return entries.map((e) =>
      e.productId === productId ? { ...e, qty: clampQty(e.qty + qty) } : e,
    )
  }
  if (entries.length >= MAX_CART_LINES) return [...entries]
  return [...entries, { productId, qty: clampQty(qty) }]
}

export function setCartQty(
  entries: readonly CartEntry[],
  productId: string,
  qty: number,
): CartEntry[] {
  return entries.map((e) => (e.productId === productId ? { ...e, qty: clampQty(qty) } : e))
}

export const removeFromCart = (entries: readonly CartEntry[], productId: string): CartEntry[] =>
  entries.filter((e) => e.productId !== productId)
