import { eq, sql } from 'drizzle-orm'
import { organizationSettings } from '@/db/schema'
import type { Db } from '@/lib/db-types'

// Ajustes de negocio por bodega. Vive en lib/ (no en una feature) porque lo leen varias:
// caja (cobro) y configuración (edición). Sin fila = valores por defecto.

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

/** Upsert atómico de los ajustes de la bodega (acotado por `orgId`, que sale de la sesión). */
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
