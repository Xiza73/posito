export class TimeoutError extends Error {
  constructor() {
    super('timeout')
    this.name = 'TimeoutError'
  }
}

/**
 * Rechaza con TimeoutError si la promesa no termina en `ms`. No cancela el trabajo de fondo (una
 * Server Action ya enviada sigue su curso): solo evita que la UI quede esperando para siempre.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** PUT directo a una URL firmada de Storage, abortado de verdad si supera `ms`. */
export async function uploadToSignedUrl(url: string, blob: Blob, ms = 60_000): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'image/webp', 'cache-control': 'max-age=31536000' },
      body: blob,
      signal: controller.signal,
    })
    if (!res.ok) throw new Error('upload')
  } catch (e) {
    if (controller.signal.aborted) throw new TimeoutError()
    throw e
  } finally {
    clearTimeout(timer)
  }
}
