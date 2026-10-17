// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import * as schema from '@/db/schema'
import {
  imageBasePath,
  UPLOAD_CLEANUP_AFTER_MS,
  UPLOAD_MAX_PENDING,
  UPLOAD_TTL_MS,
} from '@/lib/product-image'
import type { Storage } from '@/lib/storage'
import type { ProductInput } from '../lib/schemas'
import {
  cleanupExpiredUploads,
  consumeUploadAndSetImage,
  createImageUpload,
  discardImageUpload,
  hasPendingUpload,
} from './image-uploads'
import { clearProductImage, createProduct, getProductImagePath, listProducts } from './products'

const db = drizzle(new PGlite(), { schema, casing: 'snake_case' })

const ORG_A = 'orgAAAA1'
const ORG_B = 'orgBBBB2'
const USER = 'user-1'

const input = (name: string): ProductInput => ({
  name,
  barcode: null,
  priceCents: 300,
  categoryName: null,
  tracksStock: false,
  initialStock: 0,
  minStock: 0,
})

let seq = 0
const uuid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`

const newProduct = async (name: string, orgId = ORG_A) =>
  (await createProduct(db, { orgId, userId: USER, input: input(name) })).id

const upload = async (orgId: string, productId: string, now?: Date) => {
  const uploadId = uuid()
  const res = await createImageUpload(db, { orgId, productId, userId: USER, uploadId, now })
  return { uploadId, res, path: imageBasePath(orgId, productId, uploadId) }
}

const fakeStorage = (remove = vi.fn().mockResolvedValue(undefined)) =>
  ({ remove }) as unknown as Storage

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
  const now = new Date()
  await db.insert(schema.organization).values([
    { id: ORG_A, name: 'Bodega A', slug: 'a', createdAt: now },
    { id: ORG_B, name: 'Bodega B', slug: 'b', createdAt: now },
  ])
  await db.insert(schema.user).values({ id: USER, name: 'Ana', email: 'ana@test.pe' })
})

describe('subida de un solo uso', () => {
  it('confirmar fija la foto, consume la subida y devuelve la anterior', async () => {
    const id = await newProduct('Con foto')
    expect(await getProductImagePath(db, { orgId: ORG_A, id })).toBeNull()

    const first = await upload(ORG_A, id)
    expect(first.res).toBe('ok')
    expect(
      await consumeUploadAndSetImage(db, {
        orgId: ORG_A,
        productId: id,
        uploadId: first.uploadId,
        imagePath: first.path,
      }),
    ).toEqual({ ok: true, previous: null })

    const second = await upload(ORG_A, id)
    expect(
      await consumeUploadAndSetImage(db, {
        orgId: ORG_A,
        productId: id,
        uploadId: second.uploadId,
        imagePath: second.path,
      }),
    ).toEqual({ ok: true, previous: first.path })
    expect((await listProducts(db, ORG_A, { query: 'Con foto' }))[0].imagePath).toBe(second.path)
  })

  it('un uuid ya consumido se rechaza y NO cambia imagePath', async () => {
    const id = await newProduct('Consumido')
    const a = await upload(ORG_A, id)
    await consumeUploadAndSetImage(db, {
      orgId: ORG_A,
      productId: id,
      uploadId: a.uploadId,
      imagePath: a.path,
    })
    const b = await upload(ORG_A, id)
    await consumeUploadAndSetImage(db, {
      orgId: ORG_A,
      productId: id,
      uploadId: b.uploadId,
      imagePath: b.path,
    })

    // Reusar el uuid `a` (ya consumido) para volver a fijar su ruta
    expect(await hasPendingUpload(db, { orgId: ORG_A, productId: id, uploadId: a.uploadId })).toBe(
      false,
    )
    expect(
      await consumeUploadAndSetImage(db, {
        orgId: ORG_A,
        productId: id,
        uploadId: a.uploadId,
        imagePath: a.path,
      }),
    ).toEqual({ ok: false, reason: 'invalid_upload' })
    expect(await getProductImagePath(db, { orgId: ORG_A, id })).toBe(b.path)
  })

  it('una subida vencida (> 1 h) no se puede confirmar', async () => {
    const id = await newProduct('Vencida')
    const old = new Date(Date.now() - UPLOAD_TTL_MS - 1000)
    const u = await upload(ORG_A, id, old)
    expect(await hasPendingUpload(db, { orgId: ORG_A, productId: id, uploadId: u.uploadId })).toBe(
      false,
    )
    expect(
      await consumeUploadAndSetImage(db, {
        orgId: ORG_A,
        productId: id,
        uploadId: u.uploadId,
        imagePath: u.path,
      }),
    ).toEqual({ ok: false, reason: 'invalid_upload' })
    expect(await getProductImagePath(db, { orgId: ORG_A, id })).toBeNull()
  })

  it('no se confirma con otra bodega ni con otro producto', async () => {
    const id = await newProduct('Mío')
    const other = await newProduct('Otro')
    const u = await upload(ORG_A, id)
    expect(
      await consumeUploadAndSetImage(db, {
        orgId: ORG_B,
        productId: id,
        uploadId: u.uploadId,
        imagePath: u.path,
      }),
    ).toEqual({ ok: false, reason: 'invalid_upload' })
    expect(
      await consumeUploadAndSetImage(db, {
        orgId: ORG_A,
        productId: other,
        uploadId: u.uploadId,
        imagePath: u.path,
      }),
    ).toEqual({ ok: false, reason: 'invalid_upload' })
    expect(await getProductImagePath(db, { orgId: ORG_A, id })).toBeNull()
    expect(await getProductImagePath(db, { orgId: ORG_A, id: other })).toBeNull()
  })

  it('no registra subidas de un producto de otra bodega', async () => {
    const id = await newProduct('Ajeno')
    expect((await upload(ORG_B, id)).res).toBe('not_found')
  })

  it('topa las subidas pendientes por bodega y las vencidas no cuentan', async () => {
    const orgId = 'orgCCCC3'
    await db
      .insert(schema.organization)
      .values({ id: orgId, name: 'C', slug: 'c', createdAt: new Date() })
    const id = await newProduct('Tope', orgId)
    const old = new Date(Date.now() - UPLOAD_TTL_MS - 1000)
    await upload(orgId, id, old)
    for (let i = 0; i < UPLOAD_MAX_PENDING; i++) expect((await upload(orgId, id)).res).toBe('ok')
    expect((await upload(orgId, id)).res).toBe('too_many')
  })

  it('descartar elimina la subida pendiente', async () => {
    const id = await newProduct('Descartar')
    const u = await upload(ORG_A, id)
    await discardImageUpload(db, { orgId: ORG_A, uploadId: u.uploadId })
    expect(await hasPendingUpload(db, { orgId: ORG_A, productId: id, uploadId: u.uploadId })).toBe(
      false,
    )
  })
})

describe('quitar foto', () => {
  it('clearProductImage devuelve la anterior y respeta la bodega', async () => {
    const id = await newProduct('Quitar')
    const u = await upload(ORG_A, id)
    await consumeUploadAndSetImage(db, {
      orgId: ORG_A,
      productId: id,
      uploadId: u.uploadId,
      imagePath: u.path,
    })
    expect(await clearProductImage(db, { orgId: ORG_B, id })).toBeNull()
    expect(await getProductImagePath(db, { orgId: ORG_A, id })).toBe(u.path)
    expect(await clearProductImage(db, { orgId: ORG_A, id })).toEqual({ previous: u.path })
    expect(await getProductImagePath(db, { orgId: ORG_A, id })).toBeNull()
  })

  it('un producto inexistente da null / undefined', async () => {
    const id = '99999999-9999-4999-8999-999999999999'
    expect(await clearProductImage(db, { orgId: ORG_A, id })).toBeNull()
    expect(await getProductImagePath(db, { orgId: ORG_A, id })).toBeUndefined()
  })
})

describe('CHECK product_image_path_format', () => {
  it('rechaza rutas con otro formato', async () => {
    const id = await newProduct('Check')
    for (const bad of ['a/1', '../x', `${ORG_A}/${id}/no-uuid`, `${ORG_A}/${id}/${uuid()}/extra`]) {
      await expect(
        db.update(schema.product).set({ imagePath: bad }).where(eq(schema.product.id, id)),
      ).rejects.toThrow()
    }
  })
})

describe('cleanupExpiredUploads', () => {
  it('borra objetos y filas de subidas sin consumir de más de 3 h, solo de esa bodega', async () => {
    const orgId = 'orgDDDD4'
    await db
      .insert(schema.organization)
      .values({ id: orgId, name: 'D', slug: 'd', createdAt: new Date() })
    const id = await newProduct('Limpieza', orgId)
    const old = new Date(Date.now() - UPLOAD_CLEANUP_AFTER_MS - 1000)
    const between = new Date(Date.now() - UPLOAD_TTL_MS - 1000) // vencida pero aún con token vivo
    const stale = await upload(orgId, id, old)
    const mid = await upload(orgId, id, between)
    const fresh = await upload(orgId, id)
    const consumedOld = await upload(orgId, id, old)
    await consumeUploadAndSetImage(db, {
      orgId,
      productId: id,
      uploadId: consumedOld.uploadId,
      imagePath: consumedOld.path,
      now: old,
    })

    const remove = vi.fn().mockResolvedValue(undefined)
    const removed = await cleanupExpiredUploads(db, fakeStorage(remove), { orgId })

    // consumedOld se consumió (now = old): una subida consumida NO se limpia (es la foto vigente)
    expect(removed).toBe(1)
    const removedPaths = remove.mock.calls.flatMap((c) => c[1] as string[])
    expect(removedPaths).toContain(`${stale.path}-800.webp`)
    expect(removedPaths.join()).not.toContain(consumedOld.uploadId)
    expect(removedPaths.join()).not.toContain(mid.uploadId)
    expect(removedPaths.join()).not.toContain(fresh.uploadId)
    expect(await hasPendingUpload(db, { orgId, productId: id, uploadId: fresh.uploadId })).toBe(
      true,
    )

    // Otra bodega no se toca
    expect(await cleanupExpiredUploads(db, fakeStorage(), { orgId: ORG_A })).toBeGreaterThanOrEqual(
      0,
    )
  })

  it('si Storage falla conserva la fila para reintentar', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const orgId = 'orgEEEE5'
    await db
      .insert(schema.organization)
      .values({ id: orgId, name: 'E', slug: 'e', createdAt: new Date() })
    const id = await newProduct('Falla', orgId)
    await upload(orgId, id, new Date(Date.now() - UPLOAD_CLEANUP_AFTER_MS - 1000))
    const failing = fakeStorage(vi.fn().mockRejectedValue(new Error('x')))
    expect(await cleanupExpiredUploads(db, failing, { orgId })).toBe(0)
    expect(await cleanupExpiredUploads(db, fakeStorage(), { orgId })).toBe(1)
  })
})
