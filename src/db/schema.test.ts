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
    .values({
      organizationId: ORG,
      name: 'Inca Kola 500 ml',
      nameKey: 'inca kola 500 ml',
      priceCents: 300,
      stock: 5,
    })
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

  it('una venta con cliente exige el snapshot de nombre; sin cliente no hace falta', async () => {
    const [c] = await db
      .insert(schema.customer)
      .values({ organizationId: ORG, name: 'Ana', nameKey: 'ana' })
      .returning({ id: schema.customer.id })
    await expect(sale({ customerId: c.id })).rejects.toThrow()
    await expect(sale({ customerId: c.id, customerName: 'Ana' })).resolves.toBeDefined()
    await expect(sale()).resolves.toBeDefined()
  })

  it('el snapshot del documento va completo o vacío', async () => {
    await expect(sale({ customerDocumentType: 'dni' })).rejects.toThrow()
    await expect(sale({ customerDocumentNumber: '12345678' })).rejects.toThrow()
    await expect(
      sale({
        customerName: 'Ana',
        customerDocumentType: 'dni',
        customerDocumentNumber: '12345678',
      }),
    ).resolves.toBeDefined()
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

  describe('líneas de venta (sale_item)', () => {
    async function line(over: Partial<typeof schema.saleItem.$inferInsert>) {
      const num = Math.floor(Math.random() * 1e6) + 1000
      const [s] = await sale({ number: num }).returning({ id: schema.sale.id })
      return db.insert(schema.saleItem).values({
        saleId: s.id,
        productId,
        productName: 'Inca Kola 500 ml',
        unitPriceCents: 300,
        listUnitPriceCents: 300,
        priceSource: 'normal',
        quantity: 3,
        lineTotalCents: 900,
        ...over,
      })
    }

    it('una línea normal cuyo importe no es unitario × cantidad se rechaza', async () => {
      await expect(line({ lineTotalCents: 1000 })).rejects.toThrow()
      await expect(line({ priceSource: 'mayor', unitPriceCents: 250 })).rejects.toThrow()
      await expect(line({})).resolves.toBeDefined()
    })

    it('una línea manual acepta un total no divisible entre la cantidad (unitario = floor)', async () => {
      await expect(
        line({ priceSource: 'manual', unitPriceCents: 333, lineTotalCents: 1000 }),
      ).resolves.toBeDefined()
      // Hacia arriba del precio de lista también vale
      await expect(
        line({ priceSource: 'manual', unitPriceCents: 400, lineTotalCents: 1201 }),
      ).resolves.toBeDefined()
    })

    it('una línea manual exige un importe de al menos 1 céntimo', async () => {
      await expect(
        line({ priceSource: 'manual', unitPriceCents: 0, lineTotalCents: 0 }),
      ).rejects.toThrow()
      await expect(
        line({ priceSource: 'manual', unitPriceCents: 0, lineTotalCents: 1, quantity: 5 }),
      ).resolves.toBeDefined()
    })

    it('price_source solo admite normal, mayor o manual', async () => {
      await expect(line({ priceSource: 'otro' as 'manual', lineTotalCents: 900 })).rejects.toThrow()
    })
  })

  it('permite varios productos sin código de barras', async () => {
    await expect(
      db.insert(schema.product).values([
        { organizationId: ORG, name: 'Pan francés', nameKey: 'pan frances', priceCents: 30 },
        {
          organizationId: ORG,
          name: 'Café pasado',
          nameKey: 'cafe pasado',
          priceCents: 350,
          tracksStock: false,
        },
      ]),
    ).resolves.toBeDefined()
  })

  it('stock_movement: signo según tipo (venta < 0, anulación/ingreso > 0)', async () => {
    const base = { organizationId: ORG, productId, userId: USER }
    await expect(
      db.insert(schema.stockMovement).values({ ...base, type: 'ingreso', quantity: -1 }),
    ).rejects.toThrow()
    await expect(
      db.insert(schema.stockMovement).values({ ...base, type: 'ingreso', quantity: 3 }),
    ).resolves.toBeDefined()
    await expect(
      db.insert(schema.stockMovement).values({ ...base, type: 'ajuste', quantity: -2 }),
    ).resolves.toBeDefined()
  })

  it('stock_movement: una venta no descuenta ni devuelve dos veces el mismo producto', async () => {
    const [s] = await sale().returning()
    const mv = {
      organizationId: ORG,
      productId,
      userId: USER,
      saleId: s.id,
      type: 'anulacion' as const,
      quantity: 1,
    }
    await db.insert(schema.stockMovement).values(mv)
    await expect(db.insert(schema.stockMovement).values(mv)).rejects.toThrow()
  })

  it('acepta una serie de boleta válida', async () => {
    await expect(
      db.insert(schema.receiptSeries).values({ organizationId: ORG, series: 'B001' }),
    ).resolves.toBeDefined()
  })

  it('receipt_series rechaza series que no son B + 3 dígitos', async () => {
    for (const series of ['F001', 'B01', 'B0001', 'b001', 'B00A']) {
      await expect(
        db
          .update(schema.receiptSeries)
          .set({ series })
          .where(eq(schema.receiptSeries.organizationId, ORG)),
      ).rejects.toThrow()
    }
  })

  it('receipt_series rechaza un último número negativo', async () => {
    await expect(
      db
        .update(schema.receiptSeries)
        .set({ lastNumber: -1 })
        .where(eq(schema.receiptSeries.organizationId, ORG)),
    ).rejects.toThrow()
  })
})
