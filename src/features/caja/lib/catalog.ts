import type { PriceTier } from '@/lib/pricing'

/** Producto vendible en la caja (precios en céntimos enteros). */
export type CatalogProduct = {
  id: string
  name: string
  barcode: string | null
  category: string | null
  priceCents: number
  stock: number
  /** false = se prepara al momento (ej. café pasado): sin límite de stock. */
  tracksStock: boolean
  /** Base de la foto en Storage (src/lib/product-image.ts); null = sin foto. */
  imagePath: string | null
  /** Niveles de precio por mayor (vacío = sin). Solo para mostrar: el cobro los recalcula en el servidor. */
  tiers: PriceTier[]
}

export function isSoldOut(p: Pick<CatalogProduct, 'tracksStock' | 'stock'>): boolean {
  return p.tracksStock && p.stock === 0
}

/** ¿Se puede subir la cantidad en el ticket? Los productos sin control de stock siempre. */
export function canAddMore(p: Pick<CatalogProduct, 'tracksStock' | 'stock'>, qty: number): boolean {
  return !p.tracksStock || qty < p.stock
}

export function stockLabel(p: Pick<CatalogProduct, 'tracksStock' | 'stock'>): string {
  if (!p.tracksStock) return 'Preparado'
  if (p.stock === 0) return 'Agotado'
  return `${p.stock} u.`
}

/** Búsqueda por nombre o código de barras, sin distinguir mayúsculas. */
export function matchesQuery(p: Pick<CatalogProduct, 'name' | 'barcode'>, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return p.name.toLowerCase().includes(q) || (p.barcode?.toLowerCase().includes(q) ?? false)
}
