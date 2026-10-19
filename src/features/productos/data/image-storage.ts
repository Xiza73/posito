import {
  IMAGE_BUCKET,
  IMAGE_CONTENT_TYPE,
  IMAGE_MAX_BYTES,
  imageObjectPaths,
  isWebpHeader,
} from '@/lib/product-image'
import type { Storage } from '@/lib/storage'

/**
 * ¿Los dos objetos existen, son image/webp, pesan ≤ 1 MB y EMPIEZAN como un WebP real
 * (RIFF….WEBP)? Se consulta a Storage, no al cliente: el tipo declarado en la subida es solo
 * metadata, los bytes reales se comprueban aquí.
 */
export async function verifyImageObjects(storage: Storage, basePath: string): Promise<boolean> {
  const paths = imageObjectPaths(basePath)
  const infos = await Promise.all(paths.map((path) => storage.info(IMAGE_BUCKET, path)))
  const metaOk = infos.every(
    (i) =>
      i !== null && i.contentType === IMAGE_CONTENT_TYPE && i.size > 0 && i.size <= IMAGE_MAX_BYTES,
  )
  if (!metaOk) return false
  const heads = await Promise.all(paths.map((path) => storage.readHead(IMAGE_BUCKET, path, 12)))
  return heads.every(isWebpHeader)
}

/** Borra los objetos de una base. Mejor esfuerzo: un fallo se registra (sin secretos). true = borrados. */
export async function deleteImageObjects(storage: Storage, basePath: string): Promise<boolean> {
  try {
    await storage.remove(IMAGE_BUCKET, imageObjectPaths(basePath))
    return true
  } catch (e) {
    console.error(
      '[productos] no se pudieron borrar las fotos',
      e instanceof Error ? e.message : 'error',
    )
    return false
  }
}

const BUCKET_OK_MS = 10 * 60 * 1000
const bucketOkAt = new WeakMap<Storage, number>()

/**
 * Falla CERRADO si el bucket no está como lo deja `bun run storage:setup` (público, solo
 * image/webp, ≤ 1 MB). El resultado positivo se cachea ~10 min por cliente; el negativo no.
 */
export async function isImageBucketConfigured(
  storage: Storage,
  now: number = Date.now(),
): Promise<boolean> {
  const ok = bucketOkAt.get(storage)
  if (ok !== undefined && now - ok < BUCKET_OK_MS) return true

  let good = false
  try {
    const b = await storage.getBucket(IMAGE_BUCKET)
    good =
      b !== null &&
      b.public === true &&
      b.allowedMimeTypes?.length === 1 &&
      b.allowedMimeTypes[0] === IMAGE_CONTENT_TYPE &&
      b.fileSizeLimit !== null &&
      b.fileSizeLimit <= IMAGE_MAX_BYTES
  } catch (e) {
    console.error('[productos] no se pudo leer el bucket', e instanceof Error ? e.message : 'error')
    return false
  }
  if (!good) {
    console.error(`Bucket ${IMAGE_BUCKET} mal configurado: corre bun run storage:setup`)
    return false
  }
  bucketOkAt.set(storage, now)
  return true
}
