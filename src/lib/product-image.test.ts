import { describe, expect, it } from 'vitest'
import {
  imageBasePath,
  imageObjectPath,
  imageObjectPaths,
  isValidImageBasePath,
  isWebpHeader,
  productImageUrl,
  publicImageBase,
} from './product-image'

const ORG = 'orgABC123'
const PRODUCT = '11111111-1111-4111-8111-111111111111'
const OTHER_PRODUCT = '22222222-2222-4222-8222-222222222222'
const UUID = '33333333-3333-4333-8333-333333333333'

describe('rutas de objeto', () => {
  it('arma la base y las dos rutas', () => {
    const base = imageBasePath(ORG, PRODUCT, UUID)
    expect(base).toBe(`${ORG}/${PRODUCT}/${UUID}`)
    expect(imageObjectPath(base, 800)).toBe(`${base}-800.webp`)
    expect(imageObjectPaths(base)).toEqual([`${base}-800.webp`, `${base}-240.webp`])
  })
})

describe('isValidImageBasePath', () => {
  const ok = imageBasePath(ORG, PRODUCT, UUID)

  it('acepta la base propia', () => {
    expect(isValidImageBasePath(ok, ORG, PRODUCT)).toBe(true)
  })

  it.each([
    ['otra bodega', imageBasePath('otraOrg', PRODUCT, UUID)],
    ['otro producto', imageBasePath(ORG, OTHER_PRODUCT, UUID)],
    ['uuid inválido', `${ORG}/${PRODUCT}/no-es-uuid`],
    ['uuid en mayúsculas', `${ORG}/${PRODUCT}/${'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA'}`],
    ['traversal', `${ORG}/${PRODUCT}/../${OTHER_PRODUCT}/${UUID}`],
    ['traversal en el uuid', `${ORG}/${PRODUCT}/${UUID}/../x`],
    ['sufijo extra', `${ok}-800.webp`],
    ['subcarpeta', `${ORG}/${PRODUCT}/x/${UUID}`],
    ['vacía', ''],
  ])('rechaza %s', (_name, path) => {
    expect(isValidImageBasePath(path, ORG, PRODUCT)).toBe(false)
  })

  it('rechaza un productId que no es uuid o una bodega vacía', () => {
    expect(isValidImageBasePath(`${ORG}/abc/${UUID}`, ORG, 'abc')).toBe(false)
    expect(isValidImageBasePath(`/${PRODUCT}/${UUID}`, '', PRODUCT)).toBe(false)
  })
})

describe('URLs públicas', () => {
  it('deriva la base pública desde SUPABASE_URL (sin barra final ni ruta)', () => {
    const expected = 'https://abc.supabase.co/storage/v1/object/public/product-images'
    expect(publicImageBase('https://abc.supabase.co')).toBe(expected)
    expect(publicImageBase('https://abc.supabase.co/')).toBe(expected)
  })

  it('devuelve null si falta o es inválida', () => {
    expect(publicImageBase(undefined)).toBeNull()
    expect(publicImageBase('')).toBeNull()
    expect(publicImageBase('no es url')).toBeNull()
    expect(publicImageBase('javascript:alert(1)')).toBeNull()
  })

  it('arma la URL por tamaño y devuelve null sin foto o sin base', () => {
    const base = publicImageBase('https://abc.supabase.co')
    const path = imageBasePath(ORG, PRODUCT, UUID)
    expect(productImageUrl(base, path, 240)).toBe(`${base}/${path}-240.webp`)
    expect(productImageUrl(base, path, 800)).toBe(`${base}/${path}-800.webp`)
    expect(productImageUrl(base, null, 240)).toBeNull()
    expect(productImageUrl(null, path, 240)).toBeNull()
  })
})

describe('isWebpHeader', () => {
  const bytes = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)))

  it('acepta RIFF + tamaño + WEBP', () => {
    expect(isWebpHeader(bytes('RIFF\u0001\u0002\u0003\u0004WEBP'))).toBe(true)
    expect(isWebpHeader(bytes('RIFF\u0001\u0002\u0003\u0004WEBPVP8 '))).toBe(true)
  })

  it('rechaza otros formatos, cabeceras cortas y null', () => {
    expect(isWebpHeader(bytes('RIFF\u0000\u0000\u0000\u0000WAVE'))).toBe(false)
    expect(isWebpHeader(bytes('\u0089PNG\r\n\u001a\n\u0000\u0000\u0000\u0000'))).toBe(false)
    expect(isWebpHeader(bytes('RIFF'))).toBe(false)
    expect(isWebpHeader(null)).toBe(false)
  })
})
