// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { getReceiptSeries, updateReceiptSeries } from './receipt-series'

const db = drizzle(new PGlite(), { schema, casing: 'snake_case' })

const ORG_A = 'org-a'
const ORG_B = 'org-b'
const USER = 'user-1'

const addSale = (orgId: string, series: string, number: number) =>
  db.insert(schema.sale).values({
    organizationId: orgId,
    series,
    number,
    cashierId: USER,
    paymentMethod: 'efectivo',
    subtotalCents: 771,
    igvCents: 139,
    totalCents: 910,
  })

const lastNumberOf = async (orgId: string) =>
  (
    await db
      .select()
      .from(schema.receiptSeries)
      .where(eq(schema.receiptSeries.organizationId, orgId))
  )[0]?.lastNumber

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
  const now = new Date()
  await db.insert(schema.organization).values([
    { id: ORG_A, name: 'Bodega A', slug: 'a', createdAt: now },
    { id: ORG_B, name: 'Bodega B', slug: 'b', createdAt: now },
  ])
  await db.insert(schema.user).values({ id: USER, name: 'Ana', email: 'ana@test.pe' })
})

describe('getReceiptSeries', () => {
  it('sin fila devuelve B001 / 1', async () => {
    expect(await getReceiptSeries(db, ORG_A)).toEqual({ series: 'B001', nextNumber: 1 })
  })
})

describe('updateReceiptSeries', () => {
  it('guarda lastNumber = siguiente - 1 y lo lee de vuelta', async () => {
    await expect(
      updateReceiptSeries(db, { orgId: ORG_A, series: 'B003', nextNumber: 50 }),
    ).resolves.toEqual({ ok: true })
    expect(await lastNumberOf(ORG_A)).toBe(49)
    expect(await getReceiptSeries(db, ORG_A)).toEqual({ series: 'B003', nextNumber: 50 })
  })

  it('rechaza un número que ya existe en la serie y no cambia nada', async () => {
    await addSale(ORG_A, 'B003', 60)
    const res = await updateReceiptSeries(db, { orgId: ORG_A, series: 'B003', nextNumber: 60 })
    expect(res).toEqual({
      ok: false,
      error: 'Ya existen boletas hasta el número 60 en la serie B003',
    })
    expect(
      (await updateReceiptSeries(db, { orgId: ORG_A, series: 'B003', nextNumber: 10 })).ok,
    ).toBe(false)
    expect(await getReceiptSeries(db, ORG_A)).toEqual({ series: 'B003', nextNumber: 50 })
  })

  it('acepta el número justo después del último emitido', async () => {
    const res = await updateReceiptSeries(db, { orgId: ORG_A, series: 'B003', nextNumber: 61 })
    expect(res.ok).toBe(true)
  })

  it('una serie sin ventas admite cualquier número, incluso 1', async () => {
    const res = await updateReceiptSeries(db, { orgId: ORG_A, series: 'B009', nextNumber: 1 })
    expect(res.ok).toBe(true)
    expect(await getReceiptSeries(db, ORG_A)).toEqual({ series: 'B009', nextNumber: 1 })
  })

  it('las ventas de otra bodega no cuentan ni se tocan', async () => {
    await addSale(ORG_B, 'B001', 500)
    const res = await updateReceiptSeries(db, { orgId: ORG_A, series: 'B001', nextNumber: 1 })
    expect(res.ok).toBe(true)
    expect(await getReceiptSeries(db, ORG_B)).toEqual({ series: 'B001', nextNumber: 1 })
    // …y en su propia bodega sí colisiona
    const own = await updateReceiptSeries(db, { orgId: ORG_B, series: 'B001', nextNumber: 500 })
    expect(own.ok).toBe(false)
  })
})
