import { and, count, eq, sql } from 'drizzle-orm'
import { organizationSettings, product, storeSlugHistory } from '@/db/schema'
import type { Db } from '@/lib/db-types'
import { uniqueViolation } from '@/lib/errors'

// Ajustes de la tienda online. Aparte de settings.ts a propósito: cada tarjeta guarda lo suyo y este
// upsert solo nombra estas columnas (no pisa validación de ventas, precio manual ni datos del negocio).

export type StoreSettings = {
  storeEnabled: boolean
  hasWhatsapp: boolean
  storeSlug: string | null
  storeHours: string | null
  metroDeliveryEnabled: boolean
}

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  storeEnabled: false,
  hasWhatsapp: false,
  storeSlug: null,
  storeHours: null,
  metroDeliveryEnabled: false,
}

export async function getStoreSettings(db: Db, orgId: string): Promise<StoreSettings> {
  const [row] = await db
    .select({
      storeEnabled: organizationSettings.storeEnabled,
      hasWhatsapp: organizationSettings.hasWhatsapp,
      storeSlug: organizationSettings.storeSlug,
      storeHours: organizationSettings.storeHours,
      metroDeliveryEnabled: organizationSettings.metroDeliveryEnabled,
    })
    .from(organizationSettings)
    .where(eq(organizationSettings.organizationId, orgId))
  return row ?? DEFAULT_STORE_SETTINGS
}

/**
 * 'slug_taken' = otra bodega usa esa dirección (índice único) o la tuvo antes (store_slug_history).
 * Al cambiar de slug, el anterior pasa al historial (reservado para esta bodega); si la bodega
 * recupera uno suyo del historial, sale de él.
 */
export async function updateStoreSettings(
  db: Db,
  orgId: string,
  input: StoreSettings,
): Promise<{ ok: true } | { ok: false; error: 'slug_taken' }> {
  try {
    return await db.transaction(
      async (tx): Promise<{ ok: true } | { ok: false; error: 'slug_taken' }> => {
        const [current] = await tx
          .select({ storeSlug: organizationSettings.storeSlug })
          .from(organizationSettings)
          .where(eq(organizationSettings.organizationId, orgId))
          .for('update')
        const oldSlug = current?.storeSlug ?? null

        if (input.storeSlug) {
          const [held] = await tx
            .select({ organizationId: storeSlugHistory.organizationId })
            .from(storeSlugHistory)
            .where(eq(storeSlugHistory.slug, input.storeSlug))
          if (held && held.organizationId !== orgId) return { ok: false, error: 'slug_taken' }
          // Recuperar un slug propio: deja de ser "antiguo"
          if (held)
            await tx.delete(storeSlugHistory).where(eq(storeSlugHistory.slug, input.storeSlug))
        }

        await tx
          .insert(organizationSettings)
          .values({ organizationId: orgId, ...input })
          .onConflictDoUpdate({
            target: organizationSettings.organizationId,
            set: { ...input, updatedAt: sql`now()` },
          })

        if (oldSlug && oldSlug !== input.storeSlug) {
          await tx
            .insert(storeSlugHistory)
            .values({ slug: oldSlug, organizationId: orgId })
            .onConflictDoNothing()
        }
        return { ok: true }
      },
    )
  } catch (e) {
    // El upsert conflictúa por PK (se resuelve solo): la única unicidad que puede fallar es el slug
    if (uniqueViolation(e) !== null) return { ok: false, error: 'slug_taken' }
    throw e
  }
}

/** Productos que la tienda publicaría hoy (activos + "Mostrar en tienda"), para el aviso de Configuración. */
export async function countStoreProducts(db: Db, orgId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(product)
    .where(
      and(
        eq(product.organizationId, orgId),
        eq(product.active, true),
        eq(product.showInStore, true),
      ),
    )
  return row?.n ?? 0
}
