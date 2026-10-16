// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { DEFAULT_SETTINGS, getSettings, updateSettings } from './settings'

const db = drizzle(new PGlite(), { schema, casing: 'snake_case' })
const ORG_A = 'org-a'
const ORG_B = 'org-b'

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
  const now = new Date()
  await db.insert(schema.organization).values([
    { id: ORG_A, name: 'Bodega A', slug: 'a', createdAt: now },
    { id: ORG_B, name: 'Bodega B', slug: 'b', createdAt: now },
  ])
})

describe('settings', () => {
  it('sin fila devuelve los valores por defecto (validación apagada)', async () => {
    expect(await getSettings(db, ORG_A)).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS.requireSaleApproval).toBe(false)
  })

  it('updateSettings hace upsert, es idempotente y se aísla por bodega', async () => {
    await updateSettings(db, ORG_A, { requireSaleApproval: true })
    await updateSettings(db, ORG_A, { requireSaleApproval: true })
    expect(await getSettings(db, ORG_A)).toEqual({ requireSaleApproval: true })
    expect(await getSettings(db, ORG_B)).toEqual({ requireSaleApproval: false })

    await updateSettings(db, ORG_A, { requireSaleApproval: false })
    expect(await getSettings(db, ORG_A)).toEqual({ requireSaleApproval: false })
    const rows = await db
      .select()
      .from(schema.organizationSettings)
      .where(eq(schema.organizationSettings.organizationId, ORG_A))
    expect(rows).toHaveLength(1)
  })
})
