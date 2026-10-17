'use client'

import { useEffect, useRef, useState } from 'react'
import { ProductThumb } from '@/components/product-thumb'
import { IMAGE_INPUT_TYPES, resizeToWebp, validateImageFile } from '@/lib/image-resize'
import { IMAGE_LARGE_SIZE, IMAGE_THUMB_SIZE } from '@/lib/product-image'
import {
  confirmProductImage,
  type GalleryResult,
  listGalleryAction,
  moveGalleryPhotoAction,
  promoteGalleryPhotoAction,
  removeGalleryPhotoAction,
  requestProductImageUpload,
} from '../actions'
import type { GalleryPhoto } from '../data/gallery'
import { ProductImageField } from './product-image-field'

const MAX = 8
const UPLOAD_HEADERS = { 'content-type': 'image/webp', 'cache-control': 'max-age=31536000' }
const BTN =
  'h-9 cursor-pointer rounded-ctl border border-line px-3 font-medium text-xs hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50'

type Props = {
  productId: string
  productName: string
  imageBase: string
  initialPath: string | null
}

async function put(url: string, blob: Blob) {
  const res = await fetch(url, { method: 'PUT', headers: UPLOAD_HEADERS, body: blob })
  if (!res.ok) throw new Error('upload')
}

/** Foto principal + galería de fotos extra (hasta 8, solo se ven en la tienda). */
export function ProductPhotos({ productId, productName, imageBase, initialPath }: Props) {
  const [mainPath, setMainPath] = useState(initialPath)
  const [photos, setPhotos] = useState<GalleryPhoto[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // 'add' | `${acción}:${photoId}`
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    listGalleryAction({ productId }).then((res) => {
      if (!alive) return
      if (res.ok) setPhotos(res.photos)
      else setError(res.error)
    })
    return () => {
      alive = false
    }
  }, [productId])

  const count = photos?.length ?? 0

  async function run(key: string, action: () => Promise<GalleryResult & { imagePath?: string }>) {
    setBusy(key)
    setError(null)
    try {
      const res = await action()
      if (!res.ok) return setError(res.error)
      setPhotos(res.photos)
      if (res.imagePath) setMainPath(res.imagePath)
    } finally {
      setBusy(null)
    }
  }

  async function onPick(file: File | undefined) {
    if (!file) return
    const invalid = validateImageFile(file)
    if (invalid) return setError(invalid)

    setBusy('add')
    setError(null)
    try {
      let large: Blob
      let thumb: Blob
      try {
        ;[large, thumb] = await Promise.all([
          resizeToWebp(file, IMAGE_LARGE_SIZE),
          resizeToWebp(file, IMAGE_THUMB_SIZE),
        ])
      } catch {
        return setError('No se pudo leer la imagen. Prueba con otra foto.')
      }
      const signed = await requestProductImageUpload({ productId, kind: 'gallery' })
      if (!signed.ok) return setError(signed.error)
      try {
        await Promise.all([put(signed.largeUrl, large), put(signed.thumbUrl, thumb)])
      } catch {
        return setError('No se pudo subir la foto. Revisa tu conexión e inténtalo de nuevo.')
      }
      const done = await confirmProductImage({
        productId,
        basePath: signed.basePath,
        kind: 'gallery',
      })
      if (!done.ok) return setError(done.error)
      const list = await listGalleryAction({ productId })
      if (list.ok) setPhotos(list.photos)
    } finally {
      setBusy(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ProductImageField
        productId={productId}
        productName={productName}
        imageBase={imageBase}
        path={mainPath}
        onPathChange={setMainPath}
      />

      <section aria-labelledby="pf-gallery-title" className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="pf-gallery-title" className="font-medium text-sm">
            Fotos extra ({count}/{MAX})
          </h3>
          <input
            ref={inputRef}
            id="pf-gallery-input"
            type="file"
            accept={IMAGE_INPUT_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => onPick(e.currentTarget.files?.[0])}
          />
          <button
            type="button"
            disabled={busy !== null || photos === null || count >= MAX}
            onClick={() => inputRef.current?.click()}
            className={BTN}
          >
            {busy === 'add' ? 'Subiendo…' : 'Agregar foto'}
          </button>
        </div>
        <p className="text-muted text-xs">Se muestran solo en la ficha de la tienda.</p>

        {photos && photos.length > 0 ? (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p, i) => {
              const n = i + 1
              const off = busy !== null
              const pending = (a: string) => busy === `${a}:${p.id}`
              return (
                <li key={p.id} className="flex flex-col gap-1.5">
                  <ProductThumb
                    imageBase={imageBase}
                    imagePath={p.imagePath}
                    name={`${productName}, foto extra ${n}`}
                    size={240}
                    width={240}
                    height={160}
                    className="aspect-[3/2] w-full rounded-ctl"
                  />
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      aria-label={`Subir la foto extra ${n}`}
                      disabled={off || i === 0}
                      onClick={() =>
                        run(`up:${p.id}`, () =>
                          moveGalleryPhotoAction({ productId, photoId: p.id, direction: 'up' }),
                        )
                      }
                      className={BTN}
                    >
                      {pending('up') ? '…' : '↑'}
                    </button>
                    <button
                      type="button"
                      aria-label={`Bajar la foto extra ${n}`}
                      disabled={off || i === photos.length - 1}
                      onClick={() =>
                        run(`down:${p.id}`, () =>
                          moveGalleryPhotoAction({ productId, photoId: p.id, direction: 'down' }),
                        )
                      }
                      className={BTN}
                    >
                      {pending('down') ? '…' : '↓'}
                    </button>
                    <button
                      type="button"
                      aria-label={`Hacer principal la foto extra ${n}`}
                      disabled={off}
                      onClick={() =>
                        run(`promote:${p.id}`, () =>
                          promoteGalleryPhotoAction({ productId, photoId: p.id }),
                        )
                      }
                      className={BTN}
                    >
                      {pending('promote') ? 'Cambiando…' : 'Hacer principal'}
                    </button>
                    <button
                      type="button"
                      aria-label={`Quitar la foto extra ${n}`}
                      disabled={off}
                      onClick={() =>
                        run(`remove:${p.id}`, () =>
                          removeGalleryPhotoAction({ productId, photoId: p.id }),
                        )
                      }
                      className={BTN}
                    >
                      {pending('remove') ? 'Quitando…' : 'Quitar'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : photos ? (
          <p className="text-muted text-xs">Aún no hay fotos extra.</p>
        ) : null}

        {error ? (
          <p role="alert" className="text-bad text-xs">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  )
}
