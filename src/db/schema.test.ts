// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeAll, describe, expect, it } from 'vitest'
import * as schema from './schema'

// Aplica las migraciones reales sobre Postgres (PGlite, en memoria) y verifica los CHECK
const db = drizzle(new PGlite(), { schema, casing: 'snake_case' })
let productId: string

const ORG = 'org-1'
const USER = 'user-1'
const now = new Date()

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
  await db
    .insert(schema.organization)
    .values({ id: ORG, name: 'Bodega', slug: 'bodega', createdAt: now })
  await db.insert(schema.user).values({ id: USER, name: 'Ana', email: 'ana@test.pe' })
  const [p] = await db
    .insert(schema.product)
    .values({ organizationId: ORG, name: 'Inca Kola 500 ml', priceCents: 300, stock: 5 })
    .returning()
  productId = p.id
})

const sale = (over: Partial<typeof schema.sale.$inferInsert> = {}) =>
  db.insert(schema.sale).values({
    organizationId: ORG,
    series: 'B001',
    number: Math.floor(Math.random() * 1e6),
    cashierId: USER,
    paymentMethod: 'efectivo',
    subtotalCents: 771,
    igvCents: 139,
    totalCents: 910,
    ...over,
  })

describe('esquema: restricciones de integridad', () => {
  it('rechaza stock negativo', async () => {
    await expect(
      db.update(schema.product).set({ stock: -1 }).where(eq(schema.product.id, productId)),
    ).rejects.toThrow()
  })

  it('acepta una venta con totales consistentes', async () => {
    await expect(sale()).resolves.toBeDefined()
  })

  it('rechaza una venta donde subtotal + igv != total', async () => {
    await expect(sale({ igvCents: 140 })).rejects.toThrow()
  })

  it('rechaza una venta anulada sin quién/cuándo', async () => {
    await expect(sale({ status: 'anulada' })).rejects.toThrow()
  })

  it('rechaza un correlativo duplicado en la misma serie', async () => {
    await sale({ number: 38 })
    await expect(sale({ number: 38 })).rejects.toThrow()
  })

  it('rechaza un movimiento de venta sin venta asociada', async () => {
    await expect(
      db
        .insert(schema.stockMovement)
        .values({ organizationId: ORG, productId, type: 'venta', quantity: -1, userId: USER }),
    ).rejects.toThrow()
  })

  it('permite varios productos sin código de barras', async () => {
    await expect(
      db.insert(schema.product).values([
        { organizationId: ORG, name: 'Pan francés', priceCents: 30 },
        { organizationId: ORG, name: 'Café pasado', priceCents: 350, tracksStock: false },
      ]),
    ).resolves.toBeDefined()
  })
})
