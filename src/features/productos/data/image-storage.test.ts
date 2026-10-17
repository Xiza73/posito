import { describe, expect, it, vi } from 'vitest'
import type { Storage } from '@/lib/storage'
import { StorageError } from '@/lib/storage'
import { deleteImageObjects, isImageBucketConfigured, verifyImageObjects } from './image-storage'

type Parts = Partial<Pick<Storage, 'info' | 'remove' | 'readHead' | 'getBucket'>>
const fake = (parts: Parts) => parts as unknown as Storage

const ok = { size: 1000, contentType: 'image/webp' }
const webp = new TextEncoder().encode('RIFF\u0000\u0000\u0000\u0000WEBP')
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0])

describe('verifyImageObjects', () => {
  it('true si ambos objetos son webp, pequeños y empiezan con RIFF….WEBP', async () => {
    const info = vi.fn().mockResolvedValue(ok)
    const readHead = vi.fn().mockResolvedValue(webp)
    expect(await verifyImageObjects(fake({ info, readHead }), 'o/p/u')).toBe(true)
    expect(info.mock.calls.map((c) => c[1])).toEqual(['o/p/u-800.webp', 'o/p/u-240.webp'])
    expect(readHead).toHaveBeenCalledWith('product-images', 'o/p/u-800.webp', 12)
  })

  it('false si los bytes reales no son WebP aunque la metadata diga image/webp', async () => {
    const info = vi.fn().mockResolvedValue(ok)
    const readHead = vi.fn().mockResolvedValue(png)
    expect(await verifyImageObjects(fake({ info, readHead }), 'o/p/u')).toBe(false)
  })

  it('false si solo una de las dos cabeceras es WebP', async () => {
    const info = vi.fn().mockResolvedValue(ok)
    const readHead = vi.fn().mockResolvedValueOnce(webp).mockResolvedValueOnce(png)
    expect(await verifyImageObjects(fake({ info, readHead }), 'o/p/u')).toBe(false)
  })

  it.each([
    ['falta uno', vi.fn().mockResolvedValueOnce(ok).mockResolvedValueOnce(null)],
    ['otro tipo', vi.fn().mockResolvedValue({ size: 10, contentType: 'image/png' })],
    [
      'pesa más de 1 MB',
      vi.fn().mockResolvedValue({ size: 1024 * 1024 + 1, contentType: 'image/webp' }),
    ],
    ['vacío', vi.fn().mockResolvedValue({ size: 0, contentType: 'image/webp' })],
  ])('false si %s (sin leer bytes)', async (_n, info) => {
    const readHead = vi.fn()
    expect(await verifyImageObjects(fake({ info, readHead }), 'o/p/u')).toBe(false)
    expect(readHead).not.toHaveBeenCalled()
  })
})

describe('deleteImageObjects', () => {
  it('borra ambas rutas', async () => {
    const remove = vi.fn().mockResolvedValue(undefined)
    expect(await deleteImageObjects(fake({ remove }), 'o/p/u')).toBe(true)
    expect(remove).toHaveBeenCalledWith('product-images', ['o/p/u-800.webp', 'o/p/u-240.webp'])
  })

  it('no propaga errores y devuelve false', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const remove = vi.fn().mockRejectedValue(new StorageError('borrar objetos', 500))
    expect(await deleteImageObjects(fake({ remove }), 'o/p/u')).toBe(false)
  })
})

describe('isImageBucketConfigured', () => {
  const good = { public: true, fileSizeLimit: 1048576, allowedMimeTypes: ['image/webp'] }

  it('true con el bucket bien configurado y cachea el resultado ~10 min', async () => {
    const getBucket = vi.fn().mockResolvedValue(good)
    const s = fake({ getBucket })
    expect(await isImageBucketConfigured(s, 0)).toBe(true)
    expect(await isImageBucketConfigured(s, 9 * 60_000)).toBe(true)
    expect(getBucket).toHaveBeenCalledTimes(1)
    expect(await isImageBucketConfigured(s, 11 * 60_000)).toBe(true)
    expect(getBucket).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['no existe', null],
    ['no es público', { ...good, public: false }],
    ['sin lista de tipos', { ...good, allowedMimeTypes: null }],
    ['permite otros tipos', { ...good, allowedMimeTypes: ['image/webp', 'image/png'] }],
    ['tipo distinto', { ...good, allowedMimeTypes: ['image/png'] }],
    ['sin límite de tamaño', { ...good, fileSizeLimit: null }],
    ['límite mayor a 1 MB', { ...good, fileSizeLimit: 50 * 1024 * 1024 }],
  ])('falla cerrado si %s, y no cachea el negativo', async (_n, bucket) => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const getBucket = vi.fn().mockResolvedValue(bucket)
    const s = fake({ getBucket })
    expect(await isImageBucketConfigured(s, 0)).toBe(false)
    expect(err.mock.calls.join()).toContain('bun run storage:setup')
    expect(await isImageBucketConfigured(s, 1)).toBe(false)
    expect(getBucket).toHaveBeenCalledTimes(2)
  })

  it('falla cerrado si Storage da error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const getBucket = vi.fn().mockRejectedValue(new StorageError('consultar bucket', 500))
    expect(await isImageBucketConfigured(fake({ getBucket }), 0)).toBe(false)
  })
})
