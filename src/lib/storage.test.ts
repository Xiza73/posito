import { describe, expect, it, vi } from 'vitest'
import {
  createStorage,
  StorageConfigError,
  StorageError,
  storageApiBase,
  storageAuthHeaders,
  storageFromEnv,
} from './storage'

const KEY = 'service-role-secret-key'
const URL_ = 'https://abc.supabase.co'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

function setup(...responses: Response[]) {
  const fetchMock = vi.fn<typeof fetch>()
  for (const r of responses) fetchMock.mockResolvedValueOnce(r)
  return {
    fetchMock,
    storage: createStorage({ url: `${URL_}/`, serviceKey: KEY, fetch: fetchMock }),
  }
}

const call = (fetchMock: ReturnType<typeof setup>['fetchMock'], n = 0) => {
  const [input, init] = fetchMock.mock.calls[n]
  return { input: String(input), init: init as RequestInit }
}

describe('signUpload', () => {
  it('hace POST a /object/upload/sign/{bucket}/{path} con la clave en cabeceras', async () => {
    const { fetchMock, storage } = setup(
      json({ url: '/object/upload/sign/b/o/p?token=T1', token: 'T1' }),
    )
    const res = await storage.signUpload('product-images', 'org/prod/uuid-800.webp')

    const { input, init } = call(fetchMock)
    expect(input).toBe(
      `${URL_}/storage/v1/object/upload/sign/product-images/org/prod/uuid-800.webp`,
    )
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ authorization: `Bearer ${KEY}`, apikey: KEY })
    expect(res.token).toBe('T1')
    expect(res.url).toBe(`${input}?token=T1`)
  })

  it('toma el token del query de `url` si no viene `token`', async () => {
    const { storage } = setup(json({ url: '/object/upload/sign/b/p?token=ABC' }))
    expect((await storage.signUpload('b', 'p')).token).toBe('ABC')
  })

  it('un no-2xx lanza StorageError tipado sin la clave ni el cuerpo', async () => {
    const { storage } = setup(json({ message: `boom ${KEY}` }, 403))
    const err = await storage.signUpload('b', 'p').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StorageError)
    expect((err as StorageError).status).toBe(403)
    expect((err as StorageError).message).not.toContain(KEY)
    expect((err as StorageError).message).not.toContain('boom')
  })

  it('un error de red lanza StorageError con status 0', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new Error(`red ${KEY}`))
    const storage = createStorage({ url: URL_, serviceKey: KEY, fetch: fetchMock })
    const err = await storage.signUpload('b', 'p').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(StorageError)
    expect((err as StorageError).status).toBe(0)
    expect((err as StorageError).message).not.toContain(KEY)
  })

  it('sin token en la respuesta lanza StorageError', async () => {
    const { storage } = setup(json({}))
    await expect(storage.signUpload('b', 'p')).rejects.toBeInstanceOf(StorageError)
  })
})

describe('info', () => {
  it('devuelve tamaño y tipo', async () => {
    const { fetchMock, storage } = setup(json({ size: 1234, content_type: 'image/webp' }))
    expect(await storage.info('b', 'a/b.webp')).toEqual({ size: 1234, contentType: 'image/webp' })
    expect(call(fetchMock).input).toBe(`${URL_}/storage/v1/object/info/b/a/b.webp`)
  })

  it('devuelve null si no existe (404/400)', async () => {
    const { storage } = setup(json({}, 404), json({}, 400))
    expect(await storage.info('b', 'x')).toBeNull()
    expect(await storage.info('b', 'x')).toBeNull()
  })

  it('otros errores lanzan StorageError', async () => {
    const { storage } = setup(json({}, 500))
    await expect(storage.info('b', 'x')).rejects.toMatchObject({ status: 500 })
  })
})

describe('remove', () => {
  it('hace DELETE /object/{bucket} con prefixes', async () => {
    const { fetchMock, storage } = setup(json([]))
    await storage.remove('b', ['a-800.webp', 'a-240.webp'])
    const { input, init } = call(fetchMock)
    expect(input).toBe(`${URL_}/storage/v1/object/b`)
    expect(init.method).toBe('DELETE')
    expect(JSON.parse(String(init.body))).toEqual({ prefixes: ['a-800.webp', 'a-240.webp'] })
  })

  it('no llama a la red con lista vacía', async () => {
    const { fetchMock, storage } = setup()
    await storage.remove('b', [])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('un no-2xx lanza StorageError', async () => {
    const { storage } = setup(json({}, 500))
    await expect(storage.remove('b', ['x'])).rejects.toBeInstanceOf(StorageError)
  })
})

describe('ensureBucket', () => {
  const opts = { public: true, fileSizeLimit: 1048576, allowedMimeTypes: ['image/webp'] }

  it('crea el bucket si no existe', async () => {
    const { fetchMock, storage } = setup(json({}, 404), json({ name: 'b' }))
    expect(await storage.ensureBucket('b', opts)).toBe('created')
    const { input, init } = call(fetchMock, 1)
    expect(input).toBe(`${URL_}/storage/v1/bucket`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toMatchObject({
      id: 'b',
      public: true,
      file_size_limit: 1048576,
      allowed_mime_types: ['image/webp'],
    })
  })

  it('actualiza los límites si ya existe', async () => {
    const { fetchMock, storage } = setup(json({ id: 'b' }), json({ message: 'ok' }))
    expect(await storage.ensureBucket('b', opts)).toBe('updated')
    const { input, init } = call(fetchMock, 1)
    expect(input).toBe(`${URL_}/storage/v1/bucket/b`)
    expect(init.method).toBe('PUT')
  })
})

describe('storageFromEnv', () => {
  it('lanza StorageConfigError si faltan variables', () => {
    expect(() => storageFromEnv({})).toThrow(StorageConfigError)
    expect(() => storageFromEnv({ SUPABASE_URL: URL_ })).toThrow(StorageConfigError)
  })

  it('crea el cliente con ambas', () => {
    const env = {
      SUPABASE_URL: URL_,
      SUPABASE_SERVICE_ROLE_KEY: KEY,
    } as unknown as NodeJS.ProcessEnv
    expect(storageFromEnv(env).signUpload).toBeTypeOf('function')
  })
})

describe('readHead', () => {
  const bytes = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => i))

  it('pide el endpoint autenticado con Range y devuelve solo los primeros bytes', async () => {
    const { fetchMock, storage } = setup(new Response(bytes(12), { status: 206 }))
    const head = await storage.readHead('b', 'a/b.webp', 12)
    const { input, init } = call(fetchMock)
    expect(input).toBe(`${URL_}/storage/v1/object/authenticated/b/a/b.webp`)
    expect(init.headers).toMatchObject({ range: 'bytes=0-11', authorization: `Bearer ${KEY}` })
    expect(Array.from(head ?? [])).toEqual(Array.from(bytes(12)))
  })

  it('si el servidor ignora Range (200 con el cuerpo completo) solo conserva 12 bytes', async () => {
    const { storage } = setup(new Response(bytes(500), { status: 200 }))
    expect((await storage.readHead('b', 'x', 12))?.length).toBe(12)
  })

  it('un objeto corto devuelve menos bytes; 404 devuelve null; 500 lanza StorageError', async () => {
    const { storage } = setup(
      new Response(bytes(5), { status: 206 }),
      new Response('', { status: 404 }),
      new Response('', { status: 500 }),
    )
    expect((await storage.readHead('b', 'x', 12))?.length).toBe(5)
    expect(await storage.readHead('b', 'x', 12)).toBeNull()
    await expect(storage.readHead('b', 'x', 12)).rejects.toBeInstanceOf(StorageError)
  })
})

describe('getBucket', () => {
  it('lee public, file_size_limit y allowed_mime_types', async () => {
    const { fetchMock, storage } = setup(
      json({ id: 'b', public: true, file_size_limit: 1048576, allowed_mime_types: ['image/webp'] }),
    )
    expect(await storage.getBucket('b')).toEqual({
      public: true,
      fileSizeLimit: 1048576,
      allowedMimeTypes: ['image/webp'],
    })
    expect(call(fetchMock).input).toBe(`${URL_}/storage/v1/bucket/b`)
  })

  it('campos ausentes quedan en null/false; 404 devuelve null', async () => {
    const { storage } = setup(json({ id: 'b' }), json({}, 404))
    expect(await storage.getBucket('b')).toEqual({
      public: false,
      fileSizeLimit: null,
      allowedMimeTypes: null,
    })
    expect(await storage.getBucket('b')).toBeNull()
  })
})

describe('storageApiBase', () => {
  it('usa solo el origen: tolera la URL de la Data API y barras finales', () => {
    const want = 'https://abc.supabase.co/storage/v1'
    expect(storageApiBase('https://abc.supabase.co')).toBe(want)
    expect(storageApiBase('https://abc.supabase.co/')).toBe(want)
    expect(storageApiBase('https://abc.supabase.co/rest/v1/')).toBe(want)
  })

  it('rechaza protocolos que no son http(s) y URLs inválidas', () => {
    expect(() => storageApiBase('javascript:alert(1)')).toThrow(StorageConfigError)
    expect(() => storageApiBase('no-es-url')).toThrow()
  })
})

describe('storageAuthHeaders', () => {
  it('clave secreta nueva (sb_secret_…): solo apikey, nunca Bearer', () => {
    expect(storageAuthHeaders('sb_secret_abc')).toEqual({ apikey: 'sb_secret_abc' })
  })

  it('clave legacy service_role (JWT): apikey y Bearer', () => {
    expect(storageAuthHeaders('eyJhbGciOi.x.y')).toEqual({
      apikey: 'eyJhbGciOi.x.y',
      authorization: 'Bearer eyJhbGciOi.x.y',
    })
  })

  it('createStorage con clave nueva no manda Authorization', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 'b' }), { status: 200 }))
    const s = createStorage({
      url: 'https://abc.supabase.co/rest/v1/',
      serviceKey: 'sb_secret_abc',
      fetch: fetchMock as unknown as typeof fetch,
    })
    await s.getBucket('product-images').catch(() => null)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://abc.supabase.co/storage/v1/bucket/product-images')
    const headers = init.headers as Record<string, string>
    expect(headers.apikey).toBe('sb_secret_abc')
    expect(headers.authorization).toBeUndefined()
  })
})
