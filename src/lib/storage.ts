// Cliente MÍNIMO de la API REST de Supabase Storage (sin @supabase/supabase-js). Solo servidor:
// usa la service role key. Los errores NUNCA incluyen la clave, cabeceras ni cuerpos de respuesta.
// Endpoints (storage-js / storage-api):
//   POST   {url}/storage/v1/object/upload/sign/{bucket}/{path}   -> { url, token }
//   PUT    {url}/storage/v1/object/upload/sign/{bucket}/{path}?token=…   (lo hace el navegador)
//   GET    {url}/storage/v1/object/info/{bucket}/{path}          -> { size, content_type, … }
//   DELETE {url}/storage/v1/object/{bucket}   body { prefixes: [...] }
//   GET|POST {url}/storage/v1/bucket[/{id}], PUT {url}/storage/v1/bucket/{id}

export type StorageConfig = {
  /** https://<ref>.supabase.co */
  url: string
  serviceKey: string
  fetch?: typeof fetch
}

export type BucketOptions = {
  public: boolean
  fileSizeLimit: number
  allowedMimeTypes: string[]
}

export class StorageError extends Error {
  readonly status: number
  constructor(operation: string, status: number) {
    super(`Storage: ${operation} falló (HTTP ${status})`)
    this.name = 'StorageError'
    this.status = status
  }
}

export class StorageConfigError extends Error {
  constructor() {
    super('Falta configurar SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY')
    this.name = 'StorageConfigError'
  }
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/')

export function createStorage({ url, serviceKey, fetch: fetchImpl = fetch }: StorageConfig) {
  const api = `${url.replace(/\/+$/, '')}/storage/v1`
  const auth = { authorization: `Bearer ${serviceKey}`, apikey: serviceKey }

  async function call(operation: string, input: string, init: RequestInit = {}) {
    let res: Response
    try {
      res = await fetchImpl(`${api}${input}`, {
        ...init,
        headers: { ...auth, ...init.headers },
        cache: 'no-store',
      })
    } catch {
      // Error de red: sin detalle (podría incluir la URL con el token)
      throw new StorageError(operation, 0)
    }
    return res
  }

  const jsonInit = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  return {
    /** URL firmada de subida (PUT) para un objeto que aún no existe (sin upsert). */
    async signUpload(bucket: string, path: string): Promise<{ url: string; token: string }> {
      const objectPath = `/object/upload/sign/${bucket}/${encodePath(path)}`
      const res = await call('firmar subida', objectPath, {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'application/json' },
      })
      if (!res.ok) throw new StorageError('firmar subida', res.status)
      const data: unknown = await res.json().catch(() => null)
      const rawToken =
        data && typeof data === 'object' && 'token' in data && typeof data.token === 'string'
          ? data.token
          : null
      const rawUrl =
        data && typeof data === 'object' && 'url' in data && typeof data.url === 'string'
          ? data.url
          : null
      // El SDK oficial lee el token del query de `url`; se acepta cualquiera de los dos
      const token = rawToken ?? (rawUrl ? new URL(rawUrl, api).searchParams.get('token') : null)
      if (!token) throw new StorageError('firmar subida', res.status)
      return { url: `${api}${objectPath}?token=${encodeURIComponent(token)}`, token }
    },

    /** Metadatos del objeto, o null si no existe. */
    async info(
      bucket: string,
      path: string,
    ): Promise<{ size: number; contentType: string } | null> {
      const res = await call('consultar objeto', `/object/info/${bucket}/${encodePath(path)}`)
      if (res.status === 404 || res.status === 400) return null
      if (!res.ok) throw new StorageError('consultar objeto', res.status)
      const data: unknown = await res.json().catch(() => null)
      if (!data || typeof data !== 'object') throw new StorageError('consultar objeto', res.status)
      const size = 'size' in data ? Number(data.size) : Number.NaN
      const contentType =
        'content_type' in data && typeof data.content_type === 'string' ? data.content_type : ''
      if (!Number.isFinite(size)) throw new StorageError('consultar objeto', res.status)
      return { size, contentType }
    },

    /** Configuración actual del bucket, o null si no existe. */
    async getBucket(id: string): Promise<{
      public: boolean
      fileSizeLimit: number | null
      allowedMimeTypes: string[] | null
    } | null> {
      const res = await call('consultar bucket', `/bucket/${id}`)
      if (res.status === 404 || res.status === 400) return null
      if (!res.ok) throw new StorageError('consultar bucket', res.status)
      const d = (await res.json().catch(() => null)) as Record<string, unknown> | null
      if (!d || typeof d !== 'object') throw new StorageError('consultar bucket', res.status)
      const limit = d.file_size_limit
      const mimes = d.allowed_mime_types
      return {
        public: d.public === true,
        fileSizeLimit: typeof limit === 'number' ? limit : null,
        allowedMimeTypes: Array.isArray(mimes) ? mimes.filter((m) => typeof m === 'string') : null,
      }
    },

    /**
     * Primeros `length` bytes del objeto (endpoint autenticado + cabecera Range). Si el servidor
     * ignora Range y responde 200 con el cuerpo completo, solo se leen los primeros bytes y se
     * cancela el resto. null = no existe.
     */
    async readHead(bucket: string, path: string, length: number): Promise<Uint8Array | null> {
      const res = await call('leer objeto', `/object/authenticated/${bucket}/${encodePath(path)}`, {
        headers: { range: `bytes=0-${length - 1}` },
      })
      if (res.status === 404 || res.status === 400) return null
      if (!res.ok || !res.body) throw new StorageError('leer objeto', res.status)
      const reader = res.body.getReader()
      const out = new Uint8Array(length)
      let got = 0
      try {
        while (got < length) {
          const { done, value } = await reader.read()
          if (done) break
          const take = Math.min(value.length, length - got)
          out.set(value.subarray(0, take), got)
          got += take
        }
      } finally {
        await reader.cancel().catch(() => {})
      }
      return out.subarray(0, got)
    },

    async remove(bucket: string, paths: string[]): Promise<void> {
      if (paths.length === 0) return
      const res = await call(
        'borrar objetos',
        `/object/${bucket}`,
        jsonInit('DELETE', { prefixes: paths }),
      )
      if (!res.ok) throw new StorageError('borrar objetos', res.status)
    },

    /** Crea el bucket o, si existe, actualiza sus límites. Idempotente. */
    async ensureBucket(id: string, options: BucketOptions): Promise<'created' | 'updated'> {
      const body = {
        id,
        name: id,
        public: options.public,
        file_size_limit: options.fileSizeLimit,
        allowed_mime_types: options.allowedMimeTypes,
      }
      const existing = await call('consultar bucket', `/bucket/${id}`)
      if (existing.ok) {
        const res = await call('actualizar bucket', `/bucket/${id}`, jsonInit('PUT', body))
        if (!res.ok) throw new StorageError('actualizar bucket', res.status)
        return 'updated'
      }
      if (existing.status !== 404 && existing.status !== 400) {
        throw new StorageError('consultar bucket', existing.status)
      }
      const res = await call('crear bucket', '/bucket', jsonInit('POST', body))
      if (!res.ok) throw new StorageError('crear bucket', res.status)
      return 'created'
    },
  }
}

export type Storage = ReturnType<typeof createStorage>

/** Crea el cliente desde un objeto de entorno. En la app se usa vía storage-server.ts (server-only). */
export function storageFromEnv(env: Record<string, string | undefined>): Storage {
  const url = env.SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) throw new StorageConfigError()
  return createStorage({ url, serviceKey })
}
