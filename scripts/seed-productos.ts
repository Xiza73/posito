// Siembra los productos de demostración del diseño en una bodega existente.
// Uso: bun run seed:productos -- --slug bodega-san-martin
// Bun carga .env.local solo (DATABASE_URL). Omite los productos cuyo nombre ya existe.
import { parseArgs } from 'node:util'
import { and, asc, eq, like } from 'drizzle-orm'
import { member, organization, product } from '@/db/schema'
import { createProduct } from '@/features/productos/data/products'
import { db } from '@/lib/db'

type Seed = {
  name: string
  category: string
  priceCents: number
  stock: number
  /** false = se prepara al momento (sin control de stock) */
  tracksStock?: boolean
}

// Variantes del diseño aplanadas a un producto cada una (el modelo no tiene variantes).
const SEEDS: Seed[] = [
  { name: 'Inca Kola 500 ml', category: 'Bebidas', priceCents: 300, stock: 48 },
  { name: 'Inca Kola 1.5 L', category: 'Bebidas', priceCents: 750, stock: 22 },
  { name: 'Inca Kola 3 L', category: 'Bebidas', priceCents: 1200, stock: 6 },
  { name: 'Pan francés', category: 'Panadería', priceCents: 30, stock: 120 },
  { name: 'Pan francés bolsa × 10', category: 'Panadería', priceCents: 280, stock: 15 },
  { name: 'Leche Gloria tarro 400 g', category: 'Abarrotes', priceCents: 420, stock: 3 },
  { name: 'Leche Gloria caja 1 L', category: 'Abarrotes', priceCents: 590, stock: 0 },
  { name: 'Arroz Costeño 750 g', category: 'Abarrotes', priceCents: 450, stock: 30 },
  { name: 'Arroz Costeño 5 kg', category: 'Abarrotes', priceCents: 2700, stock: 8 },
  { name: 'Café pasado', category: 'Bebidas', priceCents: 350, stock: 0, tracksStock: false },
  { name: 'Detergente Bolívar 520 g', category: 'Limpieza', priceCents: 690, stock: 14 },
  { name: 'Detergente Bolívar 2 kg', category: 'Limpieza', priceCents: 2350, stock: 4 },
  { name: 'Empanada de carne', category: 'Panadería', priceCents: 300, stock: 11 },
  { name: 'Agua San Luis 625 ml', category: 'Bebidas', priceCents: 180, stock: 60 },
  { name: 'Agua San Luis 2.5 L', category: 'Bebidas', priceCents: 400, stock: 9 },
  { name: 'Lejía Clorox 1 L', category: 'Limpieza', priceCents: 550, stock: 12 },
  { name: 'Atún Florida lata 170 g', category: 'Abarrotes', priceCents: 620, stock: 2 },
]

const MIN_STOCK = 5

async function main() {
  const { values } = parseArgs({ options: { slug: { type: 'string' } } })
  if (!values.slug) {
    console.error('Uso: bun run seed:productos -- --slug <slug-de-la-bodega>')
    process.exit(1)
  }

  const [org] = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(eq(organization.slug, values.slug))
    .limit(1)
  if (!org) {
    console.error(`No existe una bodega con slug "${values.slug}"`)
    process.exit(1)
  }

  // Los movimientos de stock inicial se atribuyen al propietario/a de la bodega.
  const [owner] = await db
    .select({ userId: member.userId })
    .from(member)
    .where(and(eq(member.organizationId, org.id), like(member.role, '%owner%')))
    .orderBy(asc(member.createdAt))
    .limit(1)
  if (!owner) {
    console.error('La bodega no tiene propietario/a')
    process.exit(1)
  }

  const existing = new Set(
    (
      await db
        .select({ name: product.name })
        .from(product)
        .where(eq(product.organizationId, org.id))
    ).map((p) => p.name),
  )

  let created = 0
  for (const s of SEEDS) {
    if (existing.has(s.name)) continue
    const tracksStock = s.tracksStock ?? true
    await createProduct(db, {
      orgId: org.id,
      userId: owner.userId,
      input: {
        name: s.name,
        barcode: null,
        priceCents: s.priceCents,
        categoryName: s.category,
        tracksStock,
        initialStock: s.stock,
        minStock: tracksStock ? MIN_STOCK : 0,
      },
    })
    created++
  }
  console.log(`Bodega "${org.name}": ${created} creados, ${SEEDS.length - created} ya existían`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('No se pudo sembrar:', e instanceof Error ? e.message : e)
    process.exit(1)
  })
