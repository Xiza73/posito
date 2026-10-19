// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import {
  DEFAULT_SETTINGS,
  getBusinessProfile,
  getSettings,
  getSettingsForCheckout,
  updateBusinessProfile,
  updateSettings,
} from './settings'

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
    expect(DEFAULT_SETTINGS).toEqual({ requireSaleApproval: false, allowManualPrice: false })
  })

  it('updateSettings hace upsert, es idempotente y se aísla por bodega', async () => {
    await updateSettings(db, ORG_A, { requireSaleApproval: true })
    await updateSettings(db, ORG_A, { requireSaleApproval: true })
    expect(await getSettings(db, ORG_A)).toEqual({
      requireSaleApproval: true,
      allowManualPrice: false,
    })
    expect(await getSettings(db, ORG_B)).toEqual(DEFAULT_SETTINGS)

    await updateSettings(db, ORG_A, { requireSaleApproval: false })
    expect(await getSettings(db, ORG_A)).toEqual(DEFAULT_SETTINGS)
    const rows = await db
      .select()
      .from(schema.organizationSettings)
      .where(eq(schema.organizationSettings.organizationId, ORG_A))
    expect(rows).toHaveLength(1)
  })
})

describe('settings independientes', () => {
  const ORG_D = 'org-d'
  const profile = {
    tradeName: 'Bodega D',
    legalName: null,
    ruc: null,
    address: 'Jr. Cusco 1',
    phone: null,
    branchName: null,
    receiptFooter: null,
  }

  beforeAll(async () => {
    await db
      .insert(schema.organization)
      .values({ id: ORG_D, name: 'Bodega D', slug: 'd', createdAt: new Date() })
  })

  it('guardar allowManualPrice no pisa requireSaleApproval ni el perfil, y al revés', async () => {
    await updateBusinessProfile(db, { orgId: ORG_D, input: profile })
    await updateSettings(db, ORG_D, { requireSaleApproval: true })
    await updateSettings(db, ORG_D, { allowManualPrice: true })
    expect(await getSettings(db, ORG_D)).toEqual({
      requireSaleApproval: true,
      allowManualPrice: true,
    })
    expect((await getBusinessProfile(db, ORG_D)).address).toBe('Jr. Cusco 1')

    await updateSettings(db, ORG_D, { requireSaleApproval: false })
    expect(await getSettings(db, ORG_D)).toEqual({
      requireSaleApproval: false,
      allowManualPrice: true,
    })

    await updateBusinessProfile(db, { orgId: ORG_D, input: { ...profile, address: 'Otra' } })
    expect(await getSettings(db, ORG_D)).toEqual({
      requireSaleApproval: false,
      allowManualPrice: true,
    })
  })
})

describe('perfil del negocio', () => {
  const ORG_C = 'org-c'
  const input = {
    tradeName: 'Bodega Estrella',
    legalName: 'Estrella S.A.C.',
    ruc: '20100047218',
    address: 'Av. Lima 123',
    phone: '987654321',
    branchName: 'Sede Centro',
    receiptFooter: 'Vuelva pronto',
  }

  beforeAll(async () => {
    await db
      .insert(schema.organization)
      .values({ id: ORG_C, name: 'Bodega C', slug: 'c', createdAt: new Date() })
  })

  it('sin fila usa el nombre de la organization y el pie por defecto', async () => {
    expect(await getBusinessProfile(db, ORG_C)).toEqual({
      tradeName: 'Bodega C',
      legalName: null,
      ruc: null,
      address: null,
      phone: null,
      branchName: null,
      receiptFooter: 'Gracias por su compra',
    })
  })

  it('guardar el perfil no pisa la validación de ventas, y viceversa', async () => {
    await updateSettings(db, ORG_C, { requireSaleApproval: true })
    await updateBusinessProfile(db, { orgId: ORG_C, input })
    expect(await getSettings(db, ORG_C)).toMatchObject({ requireSaleApproval: true })
    expect(await getBusinessProfile(db, ORG_C)).toEqual(input)

    await updateSettings(db, ORG_C, { requireSaleApproval: false })
    expect(await getBusinessProfile(db, ORG_C)).toEqual(input)
    expect(await getSettings(db, ORG_C)).toMatchObject({ requireSaleApproval: false })

    await updateBusinessProfile(db, { orgId: ORG_C, input: { ...input, receiptFooter: null } })
    expect((await getBusinessProfile(db, ORG_C)).receiptFooter).toBe('Gracias por su compra')
    expect(await getSettings(db, ORG_C)).toMatchObject({ requireSaleApproval: false })
  })

  it('perfil con fila creada solo por ajustes: nombre por defecto', async () => {
    expect((await getBusinessProfile(db, ORG_B)).tradeName).toBe('Bodega B')
  })

  it('se aísla por bodega', async () => {
    expect((await getBusinessProfile(db, ORG_A)).tradeName).toBe('Bodega A')
  })
})

describe('getSettingsForCheckout', () => {
  it('lee los mismos valores que getSettings y sin fila devuelve el apagado por defecto', async () => {
    const org = 'org-chk'
    await db
      .insert(schema.organization)
      .values({ id: org, name: 'Bodega Chk', slug: 'chk', createdAt: new Date() })
    expect(await db.transaction((tx) => getSettingsForCheckout(tx, org))).toEqual(DEFAULT_SETTINGS)
    await updateSettings(db, org, { allowManualPrice: true })
    expect(await db.transaction((tx) => getSettingsForCheckout(tx, org))).toEqual({
      requireSaleApproval: false,
      allowManualPrice: true,
    })
  })
})
