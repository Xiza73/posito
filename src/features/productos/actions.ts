'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { isNextControlFlow, uniqueViolation } from '@/lib/errors'
import {
  IMAGE_BUCKET,
  imageBasePath,
  imageObjectPaths,
  isValidImageBasePath,
} from '@/lib/product-image'
import {
  ForbiddenError,
  getCurrentMember,
  type Permissions,
  requirePermission,
} from '@/lib/session'
import { getStorage, StorageConfigError } from '@/lib/storage-server'
import { revalidateStore } from '@/lib/store-cache'
import {
  consumeUploadAndAddGalleryPhoto,
  GALLERY_MAX,
  type GalleryPhoto,
  listProductGallery,
  moveGalleryPhoto,
  promoteGalleryPhoto,
  removeGalleryPhoto,
} from './data/gallery'
import {
  deleteImageObjects,
  isImageBucketConfigured,
  verifyImageObjects,
} from './data/image-storage'
import {
  cleanupExpiredUploads,
  consumeUploadAndSetImage,
  createImageUpload,
  discardImageUpload,
  hasPendingUpload,
} from './data/image-uploads'
import { commitImport, ImportConflictError, previewImport } from './data/import'
import {
  clearProductImage,
  createCategory,
  createProduct,
  deleteCategory,
  renameCategory,
  setProductActive,
  updateProduct,
} from './data/products'
import { IMPORT_MAX_ROWS, type RawImportRow } from './lib/import-parse'
import type { ImportPreview, ImportSummary } from './lib/import-validate'
import { categoryNameSchema, idSchema, productInputSchema, type TierRow } from './lib/schemas'

/** Valores crudos del formulario de producto, para repoblarlo tras un error. */
export type ProductFormValues = {
  name: string
  barcode: string
  price: string
  categoryName: string
  tracksStock: boolean
  showInStore: boolean
  initialStock: string
  minStock: string
  tiers: TierRow[]
}

export type FormState = {
  ok: boolean
  message?: string
  error?: string
  fieldErrors?: Record<string, string[] | undefined>
  values?: ProductFormValues
}

const GENERIC_ERROR = 'No se pudo completar la acción. Inténtalo de nuevo.'
const NOT_FOUND = 'No se encontró el elemento'

const text = (formData: FormData, key: string) => {
  const v = formData.get(key)
  return typeof v === 'string' ? v : ''
}

async function revalidateCatalog() {
  revalidatePath('/productos')
  revalidatePath('/productos/categorias')
  revalidatePath('/caja')
  // La tienda pública cachea por bodega (features/tienda/data/cached.ts)
  await revalidateStore()
}

/** Autoriza con la sesión: la bodega y el usuario salen de aquí, nunca del formulario. */
async function authorize(permissions: Permissions) {
  const current = await getCurrentMember()
  await requirePermission(permissions)
  return current
}

/** Traduce errores a mensajes seguros: jamás se filtra el error crudo al cliente. */
function toErrorState(
  e: unknown,
  { categoryField, values }: { categoryField: string; values?: ProductFormValues },
): FormState {
  if (isNextControlFlow(e)) throw e
  if (e instanceof ForbiddenError) return { ok: false, values, error: e.message }
  const constraint = uniqueViolation(e)
  if (constraint === 'product_org_barcode_uq') {
    return {
      ok: false,
      values,
      fieldErrors: { barcode: ['Ya existe un producto con ese código de barras'] },
    }
  }
  if (constraint === 'product_org_name_key_uq') {
    return {
      ok: false,
      values,
      fieldErrors: { name: ['Ya existe un producto con ese nombre'] },
    }
  }
  if (constraint === 'category_org_name_uq') {
    return {
      ok: false,
      values,
      fieldErrors: { [categoryField]: ['Ya existe una categoría con ese nombre'] },
    }
  }
  console.error('[productos] acción falló', e)
  return { ok: false, values, error: GENERIC_ERROR }
}

/** Filas del "Precio por mayor": campos repetidos `tierMinQty` / `tierPrice`, emparejados por posición. */
function readTiers(formData: FormData): { rows: TierRow[]; mismatch: boolean } {
  const qtys = formData.getAll('tierMinQty')
  const prices = formData.getAll('tierPrice')
  const str = (v: FormDataEntryValue | undefined) => (typeof v === 'string' ? v : '')
  // Emparejar por posición solo es seguro si hay el mismo número de cantidades y precios
  return {
    rows: qtys.map((q, i) => ({ minQty: str(q), price: str(prices[i]) })),
    mismatch: qtys.length !== prices.length,
  }
}

const TIERS_MISMATCH =
  'Los precios por mayor no son válidos. Recarga la página e inténtalo de nuevo.'

function readProductForm(formData: FormData) {
  const tiers = readTiers(formData)
  const values: ProductFormValues = {
    name: text(formData, 'name'),
    barcode: text(formData, 'barcode'),
    price: text(formData, 'price'),
    categoryName: text(formData, 'categoryName'),
    tracksStock: formData.get('tracksStock') === 'on',
    showInStore: formData.get('showInStore') === 'on',
    initialStock: text(formData, 'initialStock'),
    minStock: text(formData, 'minStock'),
    tiers: tiers.rows,
  }
  const parsed = productInputSchema.safeParse({
    name: values.name,
    barcode: values.barcode,
    priceCents: values.price,
    categoryName: values.categoryName,
    tracksStock: values.tracksStock,
    showInStore: values.showInStore,
    initialStock: values.initialStock,
    minStock: values.minStock,
    tiers: values.tiers,
  })
  return { values, parsed, tiersMismatch: tiers.mismatch }
}

/** Zod nombra el campo `priceCents`; el input del formulario se llama `price`. */
function fieldErrorsOf(error: z.ZodError<z.output<typeof productInputSchema>>) {
  const { priceCents, ...rest } = z.flattenError(error).fieldErrors
  return { ...rest, price: priceCents }
}

export async function createProductAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { values, parsed, tiersMismatch } = readProductForm(formData)
  if (tiersMismatch) return { ok: false, values, error: TIERS_MISMATCH }
  if (!parsed.success) return { ok: false, values, fieldErrors: fieldErrorsOf(parsed.error) }

  try {
    const { organization, user } = await authorize({ product: ['create'] })
    await createProduct(db, { orgId: organization.id, userId: user.id, input: parsed.data })
  } catch (e) {
    return toErrorState(e, { categoryField: 'categoryName', values })
  }

  await revalidateCatalog()
  return { ok: true, message: `Producto ${parsed.data.name} creado` }
}

export async function updateProductAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { values, parsed, tiersMismatch } = readProductForm(formData)
  if (tiersMismatch) return { ok: false, values, error: TIERS_MISMATCH }
  const id = idSchema.safeParse(text(formData, 'id'))
  if (!id.success) return { ok: false, values, error: NOT_FOUND }
  if (!parsed.success) return { ok: false, values, fieldErrors: fieldErrorsOf(parsed.error) }

  try {
    const { organization } = await authorize({ product: ['update'] })
    const res = await updateProduct(db, {
      orgId: organization.id,
      id: id.data,
      input: parsed.data,
    })
    if (!res) return { ok: false, values, error: NOT_FOUND }
  } catch (e) {
    return toErrorState(e, { categoryField: 'categoryName', values })
  }

  await revalidateCatalog()
  return { ok: true, message: 'Producto actualizado' }
}

/** Desactivar = "eliminar" (permiso product:delete); reactivar usa product:update. */
export async function toggleActiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = idSchema.safeParse(text(formData, 'id'))
  const active = text(formData, 'active') === 'true'
  if (!id.success) return { ok: false, error: NOT_FOUND }

  try {
    const { organization } = await authorize({ product: [active ? 'update' : 'delete'] })
    const done = await setProductActive(db, { orgId: organization.id, id: id.data, active })
    if (!done) return { ok: false, error: NOT_FOUND }
  } catch (e) {
    return toErrorState(e, { categoryField: 'name' })
  }

  await revalidateCatalog()
  return { ok: true, message: active ? 'Producto reactivado' : 'Producto desactivado' }
}

export async function createCategoryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = categoryNameSchema.safeParse(text(formData, 'name'))
  if (!name.success) {
    return { ok: false, fieldErrors: { name: [name.error.issues[0]?.message ?? GENERIC_ERROR] } }
  }

  try {
    const { organization } = await authorize({ product: ['create'] })
    await createCategory(db, { orgId: organization.id, name: name.data })
  } catch (e) {
    return toErrorState(e, { categoryField: 'name' })
  }

  await revalidateCatalog()
  return { ok: true, message: 'Categoría creada' }
}

export async function renameCategoryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = idSchema.safeParse(text(formData, 'id'))
  const name = categoryNameSchema.safeParse(text(formData, 'name'))
  if (!id.success) return { ok: false, error: NOT_FOUND }
  if (!name.success) {
    return { ok: false, fieldErrors: { name: [name.error.issues[0]?.message ?? GENERIC_ERROR] } }
  }

  try {
    const { organization } = await authorize({ product: ['update'] })
    const done = await renameCategory(db, {
      orgId: organization.id,
      id: id.data,
      name: name.data,
    })
    if (!done) return { ok: false, error: NOT_FOUND }
  } catch (e) {
    return toErrorState(e, { categoryField: 'name' })
  }

  await revalidateCatalog()
  return { ok: true, message: 'Categoría renombrada' }
}

export async function deleteCategoryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = idSchema.safeParse(text(formData, 'id'))
  if (!id.success) return { ok: false, error: NOT_FOUND }

  try {
    const { organization } = await authorize({ product: ['delete'] })
    const done = await deleteCategory(db, { orgId: organization.id, id: id.data })
    if (!done) return { ok: false, error: NOT_FOUND }
  } catch (e) {
    return toErrorState(e, { categoryField: 'name' })
  }

  await revalidateCatalog()
  return { ok: true, message: 'Categoría eliminada' }
}

// --- Importación masiva (CSV / Excel) ---

const rawRowSchema = z.object({
  line: z.number().int().min(1).max(1_000_000),
  name: z.string().max(1000),
  price: z.string().max(1000),
  category: z.string().max(1000),
  barcode: z.string().max(1000),
  stock: z.string().max(1000),
  minStock: z.string().max(1000),
  tracksStock: z.string().max(1000),
})
const rawRowsSchema = z.array(rawRowSchema).min(1).max(IMPORT_MAX_ROWS)
const commitSchema = z.object({ rows: rawRowsSchema, updateExisting: z.boolean() })

const INVALID_FILE = 'El archivo no es válido. Vuelve a cargarlo.'
const IMPORT_RACE =
  'Otro usuario modificó los productos durante la importación. Vuelve a revisar el archivo.'

export type PreviewImportResult = ({ ok: true } & ImportPreview) | { ok: false; error: string }

export type CommitImportResult = { ok: true; summary: ImportSummary } | { ok: false; error: string }

/** Vista previa: valida y clasifica contra el catálogo vigente. No escribe nada. */
export async function previewImportAction(rows: RawImportRow[]): Promise<PreviewImportResult> {
  const parsed = rawRowsSchema.safeParse(rows)
  if (!parsed.success) return { ok: false, error: INVALID_FILE }

  try {
    const { organization } = await authorize({ product: ['create'] })
    const preview = await previewImport(db, { orgId: organization.id, rows: parsed.data })
    return { ok: true, ...preview }
  } catch (e) {
    if (isNextControlFlow(e)) throw e
    if (e instanceof ForbiddenError) return { ok: false, error: e.message }
    console.error('[productos] vista previa de importación falló', e)
    return { ok: false, error: GENERIC_ERROR }
  }
}

/** Confirmación: el servidor re-valida y re-clasifica dentro de la transacción (no confía en la vista previa). */
export async function commitImportAction(input: {
  rows: RawImportRow[]
  updateExisting: boolean
}): Promise<CommitImportResult> {
  const parsed = commitSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: INVALID_FILE }
  const { rows, updateExisting } = parsed.data

  try {
    const { organization, user } = await authorize({
      product: updateExisting ? ['create', 'update'] : ['create'],
    })
    const summary = await commitImport(db, {
      orgId: organization.id,
      userId: user.id,
      rows,
      updateExisting,
    })
    await revalidateCatalog()
    return { ok: true, summary }
  } catch (e) {
    if (isNextControlFlow(e)) throw e
    if (e instanceof ForbiddenError) return { ok: false, error: e.message }
    if (uniqueViolation(e) !== null || e instanceof ImportConflictError) {
      return { ok: false, error: IMPORT_RACE }
    }
    console.error('[productos] importación falló', e)
    return { ok: false, error: GENERIC_ERROR }
  }
}

// --- Fotos de producto (Supabase Storage) ---
// Flujo: el navegador reduce la foto (800/240 px WebP) -> requestProductImageUpload (URLs firmadas)
// -> PUT directo a Storage -> confirmProductImage (el servidor verifica los objetos y guarda la ruta).

const IMAGE_ERROR = 'No se pudo procesar la foto. Inténtalo de nuevo.'
const IMAGE_NOT_CONFIGURED = 'El almacenamiento de fotos no está configurado.'
const kindSchema = z.enum(['main', 'gallery']).default('main')
const confirmImageSchema = z.object({
  productId: idSchema,
  basePath: z.string().max(200),
  kind: kindSchema,
})
const galleryPhotoSchema = z.object({ productId: idSchema, photoId: idSchema })
const GALLERY_FULL = `Máximo ${GALLERY_MAX} fotos extra`

export type RequestImageUploadResult =
  | { ok: true; basePath: string; largeUrl: string; thumbUrl: string }
  | { ok: false; error: string }

export type ImageResult = { ok: true; imagePath: string | null } | { ok: false; error: string }

function imageError(e: unknown): { ok: false; error: string } {
  if (isNextControlFlow(e)) throw e
  if (e instanceof ForbiddenError) return { ok: false, error: e.message }
  if (e instanceof StorageConfigError) return { ok: false, error: IMAGE_NOT_CONFIGURED }
  // Solo el mensaje: StorageError ya viene sin secretos; jamás se registra el objeto de error crudo
  console.error('[productos] foto falló', e instanceof Error ? e.message : 'error desconocido')
  return { ok: false, error: IMAGE_ERROR }
}

/** Paso 1: autoriza, verifica el producto y el bucket, registra una subida pendiente y firma dos URLs. */
export async function requestProductImageUpload(input: {
  productId: string
  kind?: 'main' | 'gallery'
}): Promise<RequestImageUploadResult> {
  const productId = idSchema.safeParse(input?.productId)
  const kind = kindSchema.safeParse(input?.kind)
  if (!productId.success || !kind.success) return { ok: false, error: NOT_FOUND }

  try {
    const { organization, user } = await authorize({ product: ['update'] })
    const storage = getStorage()
    // Falla cerrado: si el bucket no está público / solo webp / ≤ 1 MB, no se firma nada
    if (!(await isImageBucketConfigured(storage))) return { ok: false, error: IMAGE_ERROR }
    if (kind.data === 'gallery') {
      const photos = await listProductGallery(db, {
        orgId: organization.id,
        productId: productId.data,
      })
      if (photos.length >= GALLERY_MAX) return { ok: false, error: GALLERY_FULL }
    }

    const uploadId = randomUUID()
    const created = await createImageUpload(db, {
      orgId: organization.id,
      productId: productId.data,
      userId: user.id,
      uploadId,
      kind: kind.data,
    })
    if (created === 'not_found') return { ok: false, error: NOT_FOUND }
    if (created === 'too_many') {
      return { ok: false, error: 'Demasiadas subidas pendientes, intenta en unos minutos' }
    }

    const basePath = imageBasePath(organization.id, productId.data, uploadId)
    let large: { url: string }
    let thumb: { url: string }
    try {
      ;[large, thumb] = await Promise.all(
        imageObjectPaths(basePath).map((path) => storage.signUpload(IMAGE_BUCKET, path)),
      )
    } catch (e) {
      await discardImageUpload(db, { orgId: organization.id, uploadId }).catch(() => {})
      throw e
    }

    // Limpieza de subidas vencidas de la bodega: mejor esfuerzo, no afecta a esta respuesta
    await cleanupExpiredUploads(db, storage, { orgId: organization.id }).catch((e) =>
      console.error(
        '[productos] limpieza de subidas falló',
        e instanceof Error ? e.message : 'error',
      ),
    )
    return { ok: true, basePath, largeUrl: large.url, thumbUrl: thumb.url }
  } catch (e) {
    return imageError(e)
  }
}

/**
 * Paso 3: nunca confía en la ruta del cliente. Exige una subida pendiente (de un solo uso) de ESTA
 * bodega y producto, verifica metadata y bytes reales en Storage, y la consume en la misma
 * transacción que guarda la ruta.
 */
export async function confirmProductImage(input: {
  productId: string
  basePath: string
  kind?: 'main' | 'gallery'
}): Promise<ImageResult> {
  const parsed = confirmImageSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: NOT_FOUND }
  const { productId, basePath, kind } = parsed.data

  try {
    const { organization } = await authorize({ product: ['update'] })
    if (!isValidImageBasePath(basePath, organization.id, productId)) {
      return { ok: false, error: IMAGE_ERROR }
    }
    const uploadId = basePath.slice(basePath.lastIndexOf('/') + 1)
    // ANTES de tocar Storage: un uuid consumido/vencido/ajeno se rechaza sin borrar nada (sus
    // objetos pueden ser la foto vigente del producto)
    const orgId = organization.id
    if (!(await hasPendingUpload(db, { orgId, productId, uploadId, kind }))) {
      return { ok: false, error: IMAGE_ERROR }
    }

    const storage = getStorage()
    if (!(await verifyImageObjects(storage, basePath))) {
      await deleteImageObjects(storage, basePath)
      await discardImageUpload(db, { orgId, uploadId })
      return { ok: false, error: 'La foto no se subió correctamente. Inténtalo de nuevo.' }
    }

    if (kind === 'gallery') {
      const added = await consumeUploadAndAddGalleryPhoto(db, {
        orgId,
        productId,
        uploadId,
        imagePath: basePath,
      })
      if (!added.ok) {
        // 'full' / 'not_found': la subida no se consumió y nada la referencia -> se limpia
        if (added.reason !== 'invalid_upload') {
          await deleteImageObjects(storage, basePath)
          await discardImageUpload(db, { orgId, uploadId })
        }
        return {
          ok: false,
          error:
            added.reason === 'full'
              ? GALLERY_FULL
              : added.reason === 'not_found'
                ? NOT_FOUND
                : IMAGE_ERROR,
        }
      }
      await revalidateCatalog()
      return { ok: true, imagePath: basePath }
    }

    const res = await consumeUploadAndSetImage(db, {
      orgId,
      productId,
      uploadId,
      imagePath: basePath,
    })
    if (!res.ok) {
      // 'invalid_upload' = otra confirmación ganó la carrera: los objetos ya están en uso, no se borran
      if (res.reason === 'not_found') await deleteImageObjects(storage, basePath)
      return { ok: false, error: res.reason === 'not_found' ? NOT_FOUND : IMAGE_ERROR }
    }
    if (res.previous && res.previous !== basePath) await deleteImageObjects(storage, res.previous)
    await revalidateCatalog()
    return { ok: true, imagePath: basePath }
  } catch (e) {
    return imageError(e)
  }
}

export async function removeProductImage(input: { productId: string }): Promise<ImageResult> {
  const productId = idSchema.safeParse(input?.productId)
  if (!productId.success) return { ok: false, error: NOT_FOUND }

  try {
    const { organization } = await authorize({ product: ['update'] })
    const storage = getStorage()
    const res = await clearProductImage(db, { orgId: organization.id, id: productId.data })
    if (!res) return { ok: false, error: NOT_FOUND }
    if (res.previous) await deleteImageObjects(storage, res.previous)
    await revalidateCatalog()
    return { ok: true, imagePath: null }
  } catch (e) {
    return imageError(e)
  }
}

// --- Galería (fotos extra, máx. 8): se muestran solo en la tienda pública ---

export type GalleryResult = { ok: true; photos: GalleryPhoto[] } | { ok: false; error: string }

async function galleryOutcome(
  orgId: string,
  productId: string,
  found: boolean,
): Promise<GalleryResult> {
  if (!found) return { ok: false, error: NOT_FOUND }
  await revalidateCatalog()
  return { ok: true, photos: await listProductGallery(db, { orgId, productId }) }
}

export async function listGalleryAction(input: { productId: string }): Promise<GalleryResult> {
  const productId = idSchema.safeParse(input?.productId)
  if (!productId.success) return { ok: false, error: NOT_FOUND }
  try {
    const { organization } = await authorize({ product: ['update'] })
    return {
      ok: true,
      photos: await listProductGallery(db, { orgId: organization.id, productId: productId.data }),
    }
  } catch (e) {
    return imageError(e)
  }
}

export async function removeGalleryPhotoAction(input: {
  productId: string
  photoId: string
}): Promise<GalleryResult> {
  const parsed = galleryPhotoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: NOT_FOUND }
  try {
    const { organization } = await authorize({ product: ['update'] })
    const removed = await removeGalleryPhoto(db, { orgId: organization.id, ...parsed.data })
    if (removed) await deleteImageObjects(getStorage(), removed.imagePath)
    return await galleryOutcome(organization.id, parsed.data.productId, removed !== null)
  } catch (e) {
    return imageError(e)
  }
}

export async function moveGalleryPhotoAction(input: {
  productId: string
  photoId: string
  direction: 'up' | 'down'
}): Promise<GalleryResult> {
  const parsed = galleryPhotoSchema.extend({ direction: z.enum(['up', 'down']) }).safeParse(input)
  if (!parsed.success) return { ok: false, error: NOT_FOUND }
  try {
    const { organization } = await authorize({ product: ['update'] })
    const res = await moveGalleryPhoto(db, { orgId: organization.id, ...parsed.data })
    return await galleryOutcome(organization.id, parsed.data.productId, res !== null)
  } catch (e) {
    return imageError(e)
  }
}

/** La foto extra pasa a principal y la principal anterior ocupa su lugar (sin tocar Storage). */
export async function promoteGalleryPhotoAction(input: {
  productId: string
  photoId: string
}): Promise<GalleryResult & { imagePath?: string }> {
  const parsed = galleryPhotoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: NOT_FOUND }
  try {
    const { organization } = await authorize({ product: ['update'] })
    const res = await promoteGalleryPhoto(db, { orgId: organization.id, ...parsed.data })
    const out = await galleryOutcome(organization.id, parsed.data.productId, res !== null)
    return res ? { ...out, imagePath: res.imagePath } : out
  } catch (e) {
    return imageError(e)
  }
}
