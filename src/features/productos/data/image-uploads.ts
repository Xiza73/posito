import { and, asc, eq, gt, isNull, lte, sql } from 'drizzle-orm'
import { product, productImageUpload } from '@/db/schema'
import {
  imageBasePath,
  UPLOAD_CLEANUP_AFTER_MS,
  UPLOAD_CLEANUP_BATCH,
  UPLOAD_MAX_PENDING,
  UPLOAD_TTL_MS,
} from '@/lib/product-image'
import type { Storage } from '@/lib/storage'
import { deleteImageObjects } from './image-storage'
import type { Db } from './products'

// Subidas de foto de UN SOLO USO (tabla product_image_upload). Todas filtran por orgId de la sesión.

const cutoff = (now: Date, ms: number) => new Date(now.getTime() - ms)

/** Registra una subida pendiente. 'too_many' = tope de pendientes por bodega; 'not_found' = producto ajeno. */
export async function createImageUpload(
  db: Db,
  {
    orgId,
    productId,
    userId,
    uploadId,
    now = new Date(),
  }: { orgId: string; productId: string; userId: string; uploadId: string; now?: Date },
): Promise<'ok' | 'too_many' | 'not_found'> {
  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ id: product.id })
      .from(product)
      .where(and(eq(product.id, productId), eq(product.organizationId, orgId)))
      .limit(1)
    if (!found) return 'not_found'

    const [{ pending }] = await tx
      .select({ pending: sql<number>`count(*)::int` })
      .from(productImageUpload)
      .where(
        and(
          eq(productImageUpload.organizationId, orgId),
          isNull(productImageUpload.consumedAt),
          gt(productImageUpload.createdAt, cutoff(now, UPLOAD_TTL_MS)),
        ),
      )
    if (pending >= UPLOAD_MAX_PENDING) return 'too_many'

    await tx.insert(productImageUpload).values({
      id: uploadId,
      organizationId: orgId,
      productId,
      userId,
      createdAt: now,
    })
    return 'ok'
  })
}

/** Lectura (sin bloqueo) para rechazar pronto, ANTES de tocar Storage. */
export async function hasPendingUpload(
  db: Db,
  {
    orgId,
    productId,
    uploadId,
    now = new Date(),
  }: { orgId: string; productId: string; uploadId: string; now?: Date },
): Promise<boolean> {
  const [row] = await db
    .select({ id: productImageUpload.id })
    .from(productImageUpload)
    .where(
      and(
        eq(productImageUpload.id, uploadId),
        eq(productImageUpload.organizationId, orgId),
        eq(productImageUpload.productId, productId),
        isNull(productImageUpload.consumedAt),
        gt(productImageUpload.createdAt, cutoff(now, UPLOAD_TTL_MS)),
      ),
    )
    .limit(1)
  return row !== undefined
}

/** Descarta una subida pendiente (verificación fallida). */
export async function discardImageUpload(
  db: Db,
  { orgId, uploadId }: { orgId: string; uploadId: string },
): Promise<void> {
  await db
    .delete(productImageUpload)
    .where(
      and(
        eq(productImageUpload.id, uploadId),
        eq(productImageUpload.organizationId, orgId),
        isNull(productImageUpload.consumedAt),
      ),
    )
}

export type ConsumeResult =
  | { ok: true; previous: string | null }
  | { ok: false; reason: 'invalid_upload' | 'not_found' }

/**
 * Consume la subida (FOR UPDATE) y fija product.image_path en UNA transacción. Un uuid ya
 * consumido, vencido, de otro producto o de otra bodega da 'invalid_upload' sin tocar nada.
 */
export async function consumeUploadAndSetImage(
  db: Db,
  {
    orgId,
    productId,
    uploadId,
    imagePath,
    now = new Date(),
  }: { orgId: string; productId: string; uploadId: string; imagePath: string; now?: Date },
): Promise<ConsumeResult> {
  return db.transaction(async (tx): Promise<ConsumeResult> => {
    const [upload] = await tx
      .select({ id: productImageUpload.id })
      .from(productImageUpload)
      .where(
        and(
          eq(productImageUpload.id, uploadId),
          eq(productImageUpload.organizationId, orgId),
          eq(productImageUpload.productId, productId),
          isNull(productImageUpload.consumedAt),
          gt(productImageUpload.createdAt, cutoff(now, UPLOAD_TTL_MS)),
        ),
      )
      .for('update')
    if (!upload) return { ok: false, reason: 'invalid_upload' }

    const [found] = await tx
      .select({ imagePath: product.imagePath })
      .from(product)
      .where(and(eq(product.id, productId), eq(product.organizationId, orgId)))
      .for('update')
    if (!found) return { ok: false, reason: 'not_found' }

    await tx
      .update(product)
      .set({ imagePath })
      .where(and(eq(product.id, productId), eq(product.organizationId, orgId)))
    await tx
      .update(productImageUpload)
      .set({ consumedAt: now })
      .where(eq(productImageUpload.id, uploadId))
    return { ok: true, previous: found.imagePath }
  })
}

/**
 * Limpieza (mejor esfuerzo, por bodega): borra objetos + fila de las subidas sin consumir de más
 * de 3 h (1 h de validez + el token firmado dura ~2 h: antes de eso un PUT tardío aún podría
 * recrear los objetos). Si Storage falla, la fila se conserva para reintentar. Devuelve cuántas.
 */
export async function cleanupExpiredUploads(
  db: Db,
  storage: Storage,
  { orgId, now = new Date() }: { orgId: string; now?: Date },
): Promise<number> {
  const expired = await db
    .select({ id: productImageUpload.id, productId: productImageUpload.productId })
    .from(productImageUpload)
    .where(
      and(
        eq(productImageUpload.organizationId, orgId),
        isNull(productImageUpload.consumedAt),
        lte(productImageUpload.createdAt, cutoff(now, UPLOAD_CLEANUP_AFTER_MS)),
      ),
    )
    .orderBy(asc(productImageUpload.createdAt))
    .limit(UPLOAD_CLEANUP_BATCH)

  let removed = 0
  for (const row of expired) {
    const deleted = await deleteImageObjects(storage, imageBasePath(orgId, row.productId, row.id))
    if (!deleted) continue
    await db
      .delete(productImageUpload)
      .where(
        and(
          eq(productImageUpload.id, row.id),
          eq(productImageUpload.organizationId, orgId),
          isNull(productImageUpload.consumedAt),
        ),
      )
    removed++
  }
  return removed
}
