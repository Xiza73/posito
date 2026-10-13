export const CATEGORIES = ['Todos', 'Bebidas', 'Panadería', 'Abarrotes', 'Limpieza'] as const
export type Category = (typeof CATEGORIES)[number]

/** Stock >= 999 significa "preparado al momento" (sin control de stock). */
export const MADE_TO_ORDER_STOCK = 999

type Variant = { name: string; priceCents: number; stock: number }

type Product = {
  id: string
  name: string
  category: Exclude<Category, 'Todos'>
  sub: string
  sku: string
  variants: Variant[]
}

const products: Product[] = [
  {
    id: 'p1',
    name: 'Inca Kola',
    category: 'Bebidas',
    sub: 'Gaseosas',
    sku: 'BEB-001',
    variants: [
      { name: '500 ml', priceCents: 300, stock: 48 },
      { name: '1.5 L', priceCents: 750, stock: 22 },
      { name: '3 L', priceCents: 1200, stock: 6 },
    ],
  },
  {
    id: 'p2',
    name: 'Pan francés',
    category: 'Panadería',
    sub: 'Pan del día',
    sku: 'PAN-010',
    variants: [
      { name: 'Unidad', priceCents: 30, stock: 120 },
      { name: 'Bolsa × 10', priceCents: 280, stock: 15 },
    ],
  },
  {
    id: 'p3',
    name: 'Leche Gloria',
    category: 'Abarrotes',
    sub: 'Lácteos',
    sku: 'ABA-104',
    variants: [
      { name: 'Tarro 400 g', priceCents: 420, stock: 3 },
      { name: 'Caja 1 L', priceCents: 590, stock: 0 },
    ],
  },
  {
    id: 'p4',
    name: 'Arroz Costeño',
    category: 'Abarrotes',
    sub: 'Granos',
    sku: 'ABA-030',
    variants: [
      { name: '750 g', priceCents: 450, stock: 30 },
      { name: '5 kg', priceCents: 2700, stock: 8 },
    ],
  },
  {
    id: 'p5',
    name: 'Café pasado',
    category: 'Bebidas',
    sub: 'Calientes',
    sku: 'BEB-050',
    variants: [{ name: 'Vaso 8 oz', priceCents: 350, stock: 999 }],
  },
  {
    id: 'p6',
    name: 'Detergente Bolívar',
    category: 'Limpieza',
    sub: 'Lavandería',
    sku: 'LIM-002',
    variants: [
      { name: '520 g', priceCents: 690, stock: 14 },
      { name: '2 kg', priceCents: 2350, stock: 4 },
    ],
  },
  {
    id: 'p7',
    name: 'Empanada de carne',
    category: 'Panadería',
    sub: 'Salados',
    sku: 'PAN-032',
    variants: [{ name: 'Unidad', priceCents: 300, stock: 11 }],
  },
  {
    id: 'p8',
    name: 'Agua San Luis',
    category: 'Bebidas',
    sub: 'Agua',
    sku: 'BEB-012',
    variants: [
      { name: '625 ml', priceCents: 180, stock: 60 },
      { name: '2.5 L', priceCents: 400, stock: 9 },
    ],
  },
  {
    id: 'p9',
    name: 'Lejía Clorox',
    category: 'Limpieza',
    sub: 'Desinfectantes',
    sku: 'LIM-011',
    variants: [{ name: '1 L', priceCents: 550, stock: 12 }],
  },
  {
    id: 'p10',
    name: 'Atún Florida',
    category: 'Abarrotes',
    sub: 'Conservas',
    sku: 'ABA-077',
    variants: [{ name: 'Lata 170 g', priceCents: 620, stock: 2 }],
  },
]

/** Una tarjeta del catálogo = una variante vendible. */
export type CatalogItem = {
  /** Clave estable `productId:variantIndex`. */
  key: string
  /** Nombre en la grilla (incluye variante si el producto tiene varias). */
  label: string
  /** Nombre del producto y variante por separado, para el ticket. */
  productName: string
  variantName: string
  category: Exclude<Category, 'Todos'>
  sub: string
  sku: string
  priceCents: number
  stock: number
}

export const catalogItems: CatalogItem[] = products.flatMap((p) =>
  p.variants.map((v, i) => ({
    key: `${p.id}:${i}`,
    label: p.variants.length > 1 ? `${p.name} ${v.name}` : p.name,
    productName: p.name,
    variantName: v.name,
    category: p.category,
    sub: p.sub,
    sku: p.sku,
    priceCents: v.priceCents,
    stock: v.stock,
  })),
)

export const catalogByKey: ReadonlyMap<string, CatalogItem> = new Map(
  catalogItems.map((item) => [item.key, item]),
)
