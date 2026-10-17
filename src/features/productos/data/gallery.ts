import { and, asc, eq, gt, isNull } from 'drizzle-orm'
import { product, productImageUpload, productPhoto } from '@/db/schema'
import { UPLOAD_TTL_MS } from '@/lib/product-image'
import type { Db } from './products'

// Galería de fotos extra (tabla product_photo). Todas filtran por orgId de la sesión Y por
// producto: un id de foto de otro producto/bodega es 'no encontrado'. Toda mutación bloquea la
// fila del producto (FOR UPDATE) para serializar conteo y posiciones.

export const GALLERY_MAX = 8

export type GalleryPhoto = { id: string; imagePath: string; position: number }

/** Fotos extra del producto en orden (para la ficha de la tienda y el diálogo de edición). */
export async function listProductGallery(
  db: Db,
  { orgId, productId }: { orgId: string; productId: string },
): Promise<GalleryPhoto[]> {
  return db
    .select({
      id: productPhoto.id,
      imagePath: productPhoto.imagePath,
      position: productPhoto.position,
    })
    .from(productPhoto)
    .where(and(eq(productPhoto.organizationId, orgId), eq(productPhoto.productId, productId)))
    .orderBy(asc(productPhoto.position))
}

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

async function lockProduct(tx: Tx, orgId: string, productId: string) {
  const [row] = await tx
    .select({ imagePath: product.imagePath })
    .from(product)
    .where(and(eq(product.id, productId), eq(product.organizationId, orgId)))
    .for('update')
  return row
}

const photosOf = (tx: Tx, productId: string) =>
  tx
    .select()
    .from(productPhoto)
    .where(eq(productPhoto.productId, productId))
    .orderBy(asc(productPhoto.position))

/** Sube cada foto posterior una posición, de menor a mayor: nunca choca con el UNIQUE no diferible. */
async function compactFrom(tx: Tx, productId: string, removedPosition: number) {
  const later = (await photosOf(tx, productId)).filter((p) => p.position > removedPosition)
  for (const p of later) {
    await tx
      .update(productPhoto)
      .set({ position: p.position - 1 })
      .where(eq(productPhoto.id, p.id))
  }
}

export type AddResult =
  | { ok: true; photoId: string; position: number }
  | { ok: false; reason: 'invalid_upload' | 'not_found' | 'full' }

/**
 * Consume la subida (kind 'gallery', FOR UPDATE), bloquea el producto, cuenta y agrega la foto en
 * la siguiente posición, todo en UNA transacción. 'full' NO consume la subida (el llamador borra).
 */
export async function consumeUploadAndAddGalleryPhoto(
  db: Db,
  {
    orgId,
    productId,
    uploadId,
    imagePath,
    now = new Date(),
  }: { orgId: string; productId: string; uploadId: string; imagePath: string; now?: Date },
): Promise<AddResult> {
  return db.transaction(async (tx): Promise<AddResult> => {
    const [upload] = await tx
      .select({ id: productImageUpload.id })
      .from(productImageUpload)
      .where(
        and(
          eq(productImageUpload.id, uploadId),
          eq(productImageUpload.organizationId, orgId),
          eq(productImageUpload.productId, productId),
          eq(productImageUpload.kind, 'gallery'),
          isNull(productImageUpload.consumedAt),
          gt(productImageUpload.createdAt, new Date(now.getTime() - UPLOAD_TTL_MS)),
        ),
      )
      .for('update')
    if (!upload) return { ok: false, reason: 'invalid_upload' }
    if (!(await lockProduct(tx, orgId, productId))) return { ok: false, reason: 'not_found' }

    const count = (await photosOf(tx, productId)).length
    if (count >= GALLERY_MAX) return { ok: false, reason: 'full' }

    await tx.insert(productPhoto).values({
      id: uploadId,
      organizationId: orgId,
      productId,
      imagePath,
      position: count,
      createdAt: now,
    })
    await tx
      .update(productImageUpload)
      .set({ consumedAt: now })
      .where(eq(productImageUpload.id, uploadId))
    return { ok: true, photoId: uploadId, position: count }
  })
}

/** Quita la foto y compacta las posiciones. Devuelve su base para borrar los objetos tras el commit; null = no existe. */
export async function removeGalleryPhoto(
  db: Db,
  { orgId, productId, photoId }: { orgId: string; productId: string; photoId: string },
): Promise<{ imagePath: string } | null> {
  return db.transaction(async (tx) => {
    if (!(await lockProduct(tx, orgId, productId))) return null
    const photo = (await photosOf(tx, productId)).find(
      (p) => p.id === photoId && p.organizationId === orgId,
    )
    if (!photo) return null
    await tx.delete(productPhoto).where(eq(productPhoto.id, photoId))
    await compactFrom(tx, productId, photo.position)
    return { imagePath: photo.imagePath }
  })
}

/**
 * Intercambia la foto con su vecina. El UNIQUE (product_id, position) no es diferible (Drizzle no
 * lo soporta), así que la vecina se borra y se reinserta en la posición libre dentro de la misma
 * transacción. 'edge' = ya está en el extremo (no hace nada); null = no existe.
 */
export async function moveGalleryPhoto(
  db: Db,
  {
    orgId,
    productId,
    photoId,
    direction,
  }: { orgId: string; productId: string; photoId: string; direction: 'up' | 'down' },
): Promise<'ok' | 'edge' | null> {
  return db.transaction(async (tx) => {
    if (!(await lockProduct(tx, orgId, productId))) return null
    const photos = await photosOf(tx, productId)
    const i = photos.findIndex((p) => p.id === photoId && p.organizationId === orgId)
    if (i < 0) return null
    const j = direction === 'up' ? i - 1 : i + 1
    const a = photos[i]
    const b = photos[j]
    if (!b) return 'edge'

    await tx.delete(productPhoto).where(eq(productPhoto.id, b.id))
    await tx.update(productPhoto).set({ position: b.position }).where(eq(productPhoto.id, a.id))
    await tx.insert(productPhoto).values({ ...b, position: a.position })
    return 'ok'
  })
}

const lastSegment = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/**
 * La foto extra pasa a ser la principal; la principal anterior (si había) ocupa su lugar en la
 * galería. Solo se intercambian filas: no se toca Storage. null = no existe.
 */
export async function promoteGalleryPhoto(
  db: Db,
  { orgId, productId, photoId }: { orgId: string; productId: string; photoId: string },
): Promise<{ imagePath: string } | null> {
  return db.transaction(async (tx) => {
    const locked = await lockProduct(tx, orgId, productId)
    if (!locked) return null
    const photo = (await photosOf(tx, productId)).find(
      (p) => p.id === photoId && p.organizationId === orgId,
    )
    if (!photo) return null

    await tx.delete(productPhoto).where(eq(productPhoto.id, photoId))
    if (locked.imagePath) {
      // El id de la fila es el uuid de la imagen, igual que cuando se subió como extra
      await tx.insert(productPhoto).values({
        id: lastSegment(locked.imagePath),
        organizationId: orgId,
        productId,
        imagePath: locked.imagePath,
        position: photo.position,
      })
    } else {
      await compactFrom(tx, productId, photo.position)
    }
    await tx
      .update(product)
      .set({ imagePath: photo.imagePath })
      .where(and(eq(product.id, productId), eq(product.organizationId, orgId)))
    return { imagePath: photo.imagePath }
  })
}
