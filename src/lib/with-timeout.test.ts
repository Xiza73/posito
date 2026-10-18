import { afterEach, describe, expect, it, vi } from 'vitest'
import { TimeoutError, uploadToSignedUrl, withTimeout } from './with-timeout'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('withTimeout', () => {
  it('devuelve el resultado si llega a tiempo', async () => {
    await expect(withTimeout(Promise.resolve(7), 1000)).resolves.toBe(7)
  })

  it('rechaza con TimeoutError si la promesa nunca termina', async () => {
    vi.useFakeTimers()
    const p = withTimeout(new Promise(() => {}), 1000)
    vi.advanceTimersByTime(1000)
    await expect(p).rejects.toBeInstanceOf(TimeoutError)
  })

  it('propaga el error original', async () => {
    await expect(withTimeout(Promise.reject(new Error('x')), 1000)).rejects.toThrow('x')
  })
})

describe('uploadToSignedUrl', () => {
  it('aborta la petición colgada y lanza TimeoutError', async () => {
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_: string, init: RequestInit) =>
          new Promise((_, reject) =>
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('', 'AbortError')),
            ),
          ),
      ),
    )
    const p = uploadToSignedUrl('https://x/upload', new Blob(['a']), 500)
    vi.advanceTimersByTime(500)
    await expect(p).rejects.toBeInstanceOf(TimeoutError)
  })

  it('un HTTP de error no es timeout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 400 })),
    )
    const err = await uploadToSignedUrl('https://x/upload', new Blob(['a'])).catch((e) => e)
    expect(err).not.toBeInstanceOf(TimeoutError)
    expect(err.message).toBe('upload')
  })
})
