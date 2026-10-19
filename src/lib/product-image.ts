// Helpers PUROS de las fotos de producto (Supabase Storage). Sin acceso a red ni a variables
// de entorno: se importan tanto desde el servidor como desde componentes cliente.

export const IMAGE_BUCKET = 'product-images'
/** Lado máximo (px) de la imagen grande y de la miniatura. */
export const IMAGE_LARGE_SIZE = 800
export const IMAGE_THUMB_SIZE = 240
export type ImageSize = typeof IMAGE_LARGE_SIZE | typeof IMAGE_THUMB_SIZE
/** Tope por objeto en el bucket y en la confirmación (las imágenes ya vienen reducidas). */
export const IMAGE_MAX_BYTES = 1024 * 1024
export const IMAGE_CONTENT_TYPE = 'image/webp'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export const isUuid = (s: string) => UUID_RE.test(s)

/** `${orgId}/${productId}/${uuid}`: base común de los dos objetos (-800.webp y -240.webp). */
export function imageBasePath(orgId: string, productId: string, uuid: string): string {
  return `${orgId}/${productId}/${uuid}`
}

/** Ruta del objeto de un tamaño concreto a partir de la base guardada en `product.imagePath`. */
export function imageObjectPath(basePath: string, size: ImageSize): string {
  return `${basePath}-${size}.webp`
}

/** Las dos rutas de objeto de una base. */
export function imageObjectPaths(basePath: string): string[] {
  return ([IMAGE_LARGE_SIZE, IMAGE_THUMB_SIZE] as const).map((size) =>
    imageObjectPath(basePath, size),
  )
}

/**
 * ¿La base que mandó el cliente es exactamente `${orgId}/${productId}/${uuid}`? Nunca se confía
 * en rutas del cliente: sin `..`, sin otra bodega, sin otro producto, uuid en minúsculas.
 */
export function isValidImageBasePath(basePath: string, orgId: string, productId: string): boolean {
  if (!orgId || !isUuid(productId)) return false
  const prefix = `${orgId}/${productId}/`
  if (!basePath.startsWith(prefix)) return false
  return isUuid(basePath.slice(prefix.length))
}

/**
 * Base pública de lectura (`<origen>/storage/v1/object/public/product-images`) a partir de
 * SUPABASE_URL, o null si falta o no es una URL https/http válida. La URL no es secreta.
 */
export function publicImageBase(supabaseUrl: string | undefined | null): string | null {
  if (!supabaseUrl) return null
  try {
    const u = new URL(supabaseUrl)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    return `${u.origin}/storage/v1/object/public/${IMAGE_BUCKET}`
  } catch {
    return null
  }
}

/** Subidas pendientes: validez, tope por bodega y margen de limpieza (el token firmado dura ~2 h). */
export const UPLOAD_TTL_MS = 60 * 60 * 1000
export const UPLOAD_CLEANUP_AFTER_MS = 3 * 60 * 60 * 1000
export const UPLOAD_MAX_PENDING = 20
export const UPLOAD_CLEANUP_BATCH = 50

/** Cabecera de un WebP real: `RIFF` + tamaño (4 bytes) + `WEBP`. Lo declarado por el cliente no basta. */
export function isWebpHeader(bytes: Uint8Array | null): boolean {
  if (!bytes || bytes.length < 12) return false
  const at = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  return at(0) === 'RIFF' && at(8) === 'WEBP'
}

/** URL pública de la foto en un tamaño, o null si no hay foto o no hay base configurada. */
export function productImageUrl(
  publicBase: string | null,
  imagePath: string | null,
  size: ImageSize,
): string | null {
  if (!publicBase || !imagePath) return null
  return `${publicBase}/${imageObjectPath(imagePath, size)}`
}
