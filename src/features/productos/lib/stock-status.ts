export type StockStatus = 'untracked' | 'out' | 'low' | 'ok'

/** Estado visual del stock de un producto (la alerta de stock bajo es stock <= mínimo). */
export function stockStatus(p: {
  tracksStock: boolean
  stock: number
  minStock: number
}): StockStatus {
  if (!p.tracksStock) return 'untracked'
  if (p.stock === 0) return 'out'
  if (p.stock <= p.minStock) return 'low'
  return 'ok'
}
