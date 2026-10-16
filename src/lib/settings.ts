import { eq, sql } from 'drizzle-orm'
import { organization, organizationSettings } from '@/db/schema'
import {
  type BusinessProfile,
  type BusinessSnapshot,
  DEFAULT_RECEIPT_FOOTER,
  parseSnapshot,
  toSnapshot,
} from '@/lib/business-profile'
import type { Db } from '@/lib/db-types'

// Ajustes de negocio por bodega. Vive en lib/ (no en una feature) porque lo leen varias:
// caja (cobro), ventas (boleta), el shell y configuración (edición). Sin fila = valores por defecto.

export type OrganizationSettings = {
  /** Las ventas de los cajeros quedan 'pendiente' hasta que un admin las apruebe. */
  requireSaleApproval: boolean
}

export const DEFAULT_SETTINGS: OrganizationSettings = { requireSaleApproval: false }

export async function getSettings(db: Db, orgId: string): Promise<OrganizationSettings> {
  const [row] = await db
    .select({ requireSaleApproval: organizationSettings.requireSaleApproval })
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, orgId))
  return row ?? DEFAULT_SETTINGS
}

/**
 * Upsert atómico de los ajustes de la bodega (acotado por `orgId`, que sale de la sesión).
 * Solo toca `requireSaleApproval`: no pisa los datos del negocio.
 */
export async function updateSettings(
  db: Db,
  orgId: string,
  settings: OrganizationSettings,
): Promise<void> {
  await db
    .insert(organizationSettings)
    .values({ organizationId: orgId, ...settings })
    .onConflictDoUpdate({
      target: organizationSettings.organizationId,
      set: { ...settings, updatedAt: sql`now()` },
    })
}

/** Datos del negocio tal como se guardan (sin los valores por defecto). */
export type BusinessProfileInput = Omit<BusinessProfile, 'receiptFooter'> & {
  /** null = usar el agradecimiento por defecto. */
  receiptFooter: string | null
}

/** Perfil vigente: nombre comercial por defecto = nombre de la organization; pie por defecto. */
export async function getBusinessProfile(db: Db, orgId: string): Promise<BusinessProfile> {
  const [row] = await db
    .select({
      orgName: organization.name,
      tradeName: organizationSettings.tradeName,
      legalName: organizationSettings.legalName,
      ruc: organizationSettings.ruc,
      address: organizationSettings.address,
      phone: organizationSettings.phone,
      branchName: organizationSettings.branchName,
      receiptFooter: organizationSettings.receiptFooter,
    })
    .from(organization)
    .leftJoin(organizationSettings, eq(organizationSettings.organizationId, organization.id))
    .where(eq(organization.id, orgId))
    .limit(1)
  return {
    tradeName: row?.tradeName || row?.orgName || '',
    legalName: row?.legalName ?? null,
    ruc: row?.ruc ?? null,
    address: row?.address ?? null,
    phone: row?.phone ?? null,
    branchName: row?.branchName ?? null,
    receiptFooter: row?.receiptFooter || DEFAULT_RECEIPT_FOOTER,
  }
}

/**
 * Upsert de los datos del negocio (acotado por `orgId` de la sesión). El `set` solo nombra las
 * columnas del perfil: no pisa `requireSaleApproval`.
 */
export async function updateBusinessProfile(
  db: Db,
  { orgId, input }: { orgId: string; input: BusinessProfileInput },
): Promise<void> {
  const fields = {
    tradeName: input.tradeName,
    legalName: input.legalName,
    ruc: input.ruc,
    address: input.address,
    phone: input.phone,
    branchName: input.branchName,
    receiptFooter: input.receiptFooter,
  }
  await db
    .insert(organizationSettings)
    .values({ organizationId: orgId, ...fields })
    .onConflictDoUpdate({
      target: organizationSettings.organizationId,
      set: { ...fields, updatedAt: sql`now()` },
    })
}

/** Snapshot guardado en la venta o, si no hay/está dañado (ventas antiguas), el perfil vigente. */
export async function snapshotOrCurrent(
  db: Db,
  orgId: string,
  raw: unknown,
): Promise<BusinessSnapshot> {
  return parseSnapshot(raw) ?? toSnapshot(await getBusinessProfile(db, orgId))
}
