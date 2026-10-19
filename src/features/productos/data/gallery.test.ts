// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { imageBasePath } from '@/lib/product-image'
import type { ProductInput } from '../lib/schemas'
import {
  consumeUploadAndAddGalleryPhoto,
  GALLERY_MAX,
  listProductGallery,
  moveGalleryPhoto,
  promoteGalleryPhoto,
  removeGalleryPhoto,
} from './gallery'
import {
  consumeUploadAndSetImage,
  createImageUpload,
  hasPendingUpload,
  type UploadKind,
} from './image-uploads'
import { createProduct, getProductImagePath } from './products'

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

const upload = async (productId: string, kind: UploadKind, orgId = ORG_A) => {
  const uploadId = uuid()
  await createImageUpload(db, { orgId, productId, userId: USER, uploadId, kind })
  return { uploadId, path: imageBasePath(orgId, productId, uploadId) }
}

const addPhoto = async (productId: string, orgId = ORG_A) => {
  const u = await upload(productId, 'gallery', orgId)
  const res = await consumeUploadAndAddGalleryPhoto(db, {
    orgId,
    productId,
    uploadId: u.uploadId,
    imagePath: u.path,
  })
  return { ...u, res }
}

const setMain = async (productId: string) => {
  const u = await upload(productId, 'main')
  await consumeUploadAndSetImage(db, {
    orgId: ORG_A,
    productId,
    uploadId: u.uploadId,
    imagePath: u.path,
  })
  return u
}

const ids = async (productId: string, orgId = ORG_A) =>
  (await listProductGallery(db, { orgId, productId })).map((p) => p.id)
const positions = async (productId: string) =>
  (await listProductGallery(db, { orgId: ORG_A, productId })).map((p) => p.position)

async function withPhotos(name: string, n: number) {
  const productId = await newProduct(name)
  const photos = []
  for (let i = 0; i < n; i++) photos.push(await addPhoto(productId))
  return { productId, photos }
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
  const now = new Date()
  await db.insert(schema.organization).values([
    { id: ORG_A, name: 'Bodega A', slug: 'a', createdAt: now },
    { id: ORG_B, name: 'Bodega B', slug: 'b', createdAt: now },
  ])
  await db.insert(schema.user).values({ id: USER, name: 'Ana', email: 'ana@test.pe' })
})

describe('agregar a la galería', () => {
  it('inserta en la siguiente posición y consume la subida', async () => {
    const { productId, photos } = await withPhotos('Galería', 3)
    expect(await ids(productId)).toEqual(photos.map((p) => p.uploadId))
    expect(await positions(productId)).toEqual([0, 1, 2])
    expect(photos[2].res).toEqual({ ok: true, photoId: photos[2].uploadId, position: 2 })
    // de un solo uso
    expect(
      await consumeUploadAndAddGalleryPhoto(db, {
        orgId: ORG_A,
        productId,
        uploadId: photos[0].uploadId,
        imagePath: photos[0].path,
      }),
    ).toEqual({ ok: false, reason: 'invalid_upload' })
  })

  it('rechaza la 9.ª foto sin consumir la subida', async () => {
    const { productId } = await withPhotos('Llena', GALLERY_MAX)
    const extra = await addPhoto(productId)
    expect(extra.res).toEqual({ ok: false, reason: 'full' })
    expect(await ids(productId)).toHaveLength(GALLERY_MAX)
    expect(
      await hasPendingUpload(db, {
        orgId: ORG_A,
        productId,
        uploadId: extra.uploadId,
        kind: 'gallery',
      }),
    ).toBe(true)
  })

  it('una subida main no se confirma como galería y viceversa', async () => {
    const productId = await newProduct('Tipos')
    const main = await upload(productId, 'main')
    expect(
      await consumeUploadAndAddGalleryPhoto(db, {
        orgId: ORG_A,
        productId,
        uploadId: main.uploadId,
        imagePath: main.path,
      }),
    ).toEqual({ ok: false, reason: 'invalid_upload' })
    expect(
      await hasPendingUpload(db, {
        orgId: ORG_A,
        productId,
        uploadId: main.uploadId,
        kind: 'gallery',
      }),
    ).toBe(false)

    const gal = await upload(productId, 'gallery')
    expect(
      await consumeUploadAndSetImage(db, {
        orgId: ORG_A,
        productId,
        uploadId: gal.uploadId,
        imagePath: gal.path,
      }),
    ).toEqual({ ok: false, reason: 'invalid_upload' })
    expect(await getProductImagePath(db, { orgId: ORG_A, id: productId })).toBeNull()
    expect(await ids(productId)).toEqual([])
  })

  it('no confirma con otra bodega ni con otro producto', async () => {
    const productId = await newProduct('Mío')
    const other = await newProduct('Otro')
    const u = await upload(productId, 'gallery')
    for (const args of [
      { orgId: ORG_B, productId },
      { orgId: ORG_A, productId: other },
    ]) {
      expect(
        await consumeUploadAndAddGalleryPhoto(db, {
          ...args,
          uploadId: u.uploadId,
          imagePath: u.path,
        }),
      ).toEqual({ ok: false, reason: 'invalid_upload' })
    }
    expect(await ids(productId)).toEqual([])
  })
})

describe('quitar', () => {
  it('compacta las posiciones y devuelve la ruta', async () => {
    const { productId, photos } = await withPhotos('Quitar', 4)
    const photoId = photos[1].uploadId
    const res = await removeGalleryPhoto(db, { orgId: ORG_A, productId, photoId })
    expect(res).toEqual({ imagePath: photos[1].path })
    expect(await ids(productId)).toEqual([photos[0], photos[2], photos[3]].map((p) => p.uploadId))
    expect(await positions(productId)).toEqual([0, 1, 2])
    expect((await addPhoto(productId)).res).toMatchObject({ ok: true, position: 3 })
  })

  it('una foto de otro producto o bodega no se encuentra', async () => {
    const a = await withPhotos('A', 1)
    const b = await withPhotos('B', 1)
    const photoId = a.photos[0].uploadId
    const other = { orgId: ORG_A, productId: b.productId, photoId }
    expect(await removeGalleryPhoto(db, other)).toBeNull()
    expect(
      await removeGalleryPhoto(db, { orgId: ORG_B, productId: a.productId, photoId }),
    ).toBeNull()
    expect(await ids(a.productId)).toEqual([photoId])
  })
})

describe('mover', () => {
  it('intercambia con la vecina y respeta los extremos', async () => {
    const { productId, photos } = await withPhotos('Mover', 3)
    const [p0, p1, p2] = photos.map((p) => p.uploadId)
    const move = (photoId: string, direction: 'up' | 'down') =>
      moveGalleryPhoto(db, { orgId: ORG_A, productId, photoId, direction })

    expect(await move(p0, 'up')).toBe('edge')
    expect(await move(p2, 'down')).toBe('edge')
    expect(await ids(productId)).toEqual([p0, p1, p2])

    expect(await move(p0, 'down')).toBe('ok')
    expect(await ids(productId)).toEqual([p1, p0, p2])
    expect(await move(p2, 'up')).toBe('ok')
    expect(await ids(productId)).toEqual([p1, p2, p0])
    expect(await positions(productId)).toEqual([0, 1, 2])
    const list = await listProductGallery(db, { orgId: ORG_A, productId })
    expect(list.find((p) => p.id === p0)?.imagePath).toBe(photos[0].path)
  })

  it('funciona con la galería llena y rechaza ids ajenos', async () => {
    const { productId, photos } = await withPhotos('Llena mover', GALLERY_MAX)
    const photoId = photos[GALLERY_MAX - 1].uploadId
    const args = { orgId: ORG_A, productId, photoId, direction: 'up' as const }
    expect(await moveGalleryPhoto(db, args)).toBe('ok')
    expect(await positions(productId)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(await moveGalleryPhoto(db, { ...args, orgId: ORG_B })).toBeNull()
    const other = await newProduct('Otro mover')
    expect(await moveGalleryPhoto(db, { ...args, productId: other })).toBeNull()
  })
})

describe('hacer principal', () => {
  it('con principal: intercambia principal y extra en su lugar', async () => {
    const { productId, photos } = await withPhotos('Promover', 3)
    const main = await setMain(productId)
    const res = await promoteGalleryPhoto(db, {
      orgId: ORG_A,
      productId,
      photoId: photos[1].uploadId,
    })
    expect(res).toEqual({ imagePath: photos[1].path })
    expect(await getProductImagePath(db, { orgId: ORG_A, id: productId })).toBe(photos[1].path)
    const list = await listProductGallery(db, { orgId: ORG_A, productId })
    expect(list.map((p) => p.imagePath)).toEqual([photos[0].path, main.path, photos[2].path])
    expect(list.map((p) => p.position)).toEqual([0, 1, 2])
    expect(list[1].id).toBe(main.uploadId)

    // ida y vuelta
    await promoteGalleryPhoto(db, { orgId: ORG_A, productId, photoId: main.uploadId })
    expect(await getProductImagePath(db, { orgId: ORG_A, id: productId })).toBe(main.path)
    expect((await listProductGallery(db, { orgId: ORG_A, productId }))[1].imagePath).toBe(
      photos[1].path,
    )
  })

  it('sin principal: la extra sale de la galería y se compacta', async () => {
    const { productId, photos } = await withPhotos('Sin principal', 3)
    await promoteGalleryPhoto(db, { orgId: ORG_A, productId, photoId: photos[0].uploadId })
    expect(await getProductImagePath(db, { orgId: ORG_A, id: productId })).toBe(photos[0].path)
    expect(await ids(productId)).toEqual([photos[1].uploadId, photos[2].uploadId])
    expect(await positions(productId)).toEqual([0, 1])
  })

  it('con la galería llena también funciona; ids ajenos no se encuentran', async () => {
    const { productId, photos } = await withPhotos('Llena promover', GALLERY_MAX)
    await setMain(productId)
    const photoId = photos[3].uploadId
    expect(await promoteGalleryPhoto(db, { orgId: ORG_B, productId, photoId })).toBeNull()
    const other = await newProduct('Otro promover')
    expect(await promoteGalleryPhoto(db, { orgId: ORG_A, productId: other, photoId })).toBeNull()
    expect(await promoteGalleryPhoto(db, { orgId: ORG_A, productId, photoId })).not.toBeNull()
    expect(await ids(productId)).toHaveLength(GALLERY_MAX)
  })
})

describe('listProductGallery y CHECKs', () => {
  it('filtra por bodega', async () => {
    const { productId } = await withPhotos('Lista', 2)
    expect(await ids(productId, ORG_B)).toEqual([])
  })

  it('rechaza posición fuera de 0..7, ruta inválida, posición repetida y kind inválido', async () => {
    const productId = await newProduct('Checks')
    const valid = imageBasePath(ORG_A, productId, uuid())
    const insert = (v: { imagePath?: string; position: number }) =>
      db
        .insert(schema.productPhoto)
        .values({ organizationId: ORG_A, productId, id: uuid(), imagePath: valid, ...v })
    await expect(insert({ position: 8 })).rejects.toThrow()
    await expect(insert({ position: -1 })).rejects.toThrow()
    await expect(insert({ position: 0, imagePath: '../x' })).rejects.toThrow()
    await insert({ position: 0 })
    await expect(insert({ position: 0 })).rejects.toThrow()

    const u = await upload(productId, 'main')
    await expect(
      db
        .update(schema.productImageUpload)
        .set({ kind: 'otro' as UploadKind })
        .where(eq(schema.productImageUpload.id, u.uploadId)),
    ).rejects.toThrow()
  })
})
