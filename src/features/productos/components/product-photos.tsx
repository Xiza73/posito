'use client'

import { useEffect, useRef, useState } from 'react'
import { ProductThumb } from '@/components/product-thumb'
import { IMAGE_INPUT_TYPES, resizeToWebp, validateImageFile } from '@/lib/image-resize'
import { IMAGE_LARGE_SIZE, IMAGE_THUMB_SIZE } from '@/lib/product-image'
import { TimeoutError, uploadToSignedUrl, withTimeout } from '@/lib/with-timeout'
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
import { galleryUploadSummary, planGalleryUpload } from '../lib/gallery-upload'
import { ProductImageField } from './product-image-field'

const MAX = 8
const STEP_MS = 30_000
const TOO_SLOW = 'La subida tardó demasiado. Revisa tu conexión e inténtalo de nuevo.'
const BTN =
  'h-9 cursor-pointer rounded-ctl border border-line px-3 font-medium text-xs hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50'

type Props = {
  productId: string
  productName: string
  imageBase: string
  initialPath: string | null
  /** true mientras cualquier foto (principal o extra) se sube o cambia: el formulario se bloquea. */
  onBusyChange?: (busy: boolean) => void
}

/** Foto principal + galería de fotos extra (hasta 8, solo se ven en la tienda). */
export function ProductPhotos({
  productId,
  productName,
  imageBase,
  initialPath,
  onBusyChange,
}: Props) {
  const [mainPath, setMainPath] = useState(initialPath)
  const [photos, setPhotos] = useState<GalleryPhoto[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null) // 'add' | `${acción}:${photoId}`
  const [error, setError] = useState<string | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [mainBusy, setMainBusy] = useState(false)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const anyBusy = busy !== null || mainBusy

  useEffect(() => {
    onBusyChange?.(anyBusy)
  }, [anyBusy, onBusyChange])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    listGalleryAction({ productId }).then((res) => {
      if (!alive) return
      if (res.ok) setPhotos(res.photos)
      else {
        setLoadFailed(true)
        setError(res.error)
      }
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
      const res = await withTimeout(action(), STEP_MS)
      if (!res.ok) return setError(res.error)
      setPhotos(res.photos)
      if (res.imagePath) setMainPath(res.imagePath)
    } catch (e) {
      setError(
        e instanceof TimeoutError
          ? TOO_SLOW
          : 'No se pudo completar la acción. Inténtalo de nuevo.',
      )
    } finally {
      setBusy(null)
    }
  }

  /** Sube UNA foto extra. Devuelve null si salió bien o el mensaje de error. */
  async function uploadOne(file: File): Promise<string | null> {
    const invalid = validateImageFile(file)
    if (invalid) return invalid
    let large: Blob
    let thumb: Blob
    try {
      ;[large, thumb] = await withTimeout(
        Promise.all([resizeToWebp(file, IMAGE_LARGE_SIZE), resizeToWebp(file, IMAGE_THUMB_SIZE)]),
        STEP_MS,
      )
    } catch {
      return 'no se pudo leer la imagen'
    }
    try {
      const signed = await withTimeout(
        requestProductImageUpload({ productId, kind: 'gallery' }),
        STEP_MS,
      )
      if (!signed.ok) return signed.error
      await Promise.all([
        uploadToSignedUrl(signed.largeUrl, large),
        uploadToSignedUrl(signed.thumbUrl, thumb),
      ])
      const done = await withTimeout(
        confirmProductImage({ productId, basePath: signed.basePath, kind: 'gallery' }),
        STEP_MS,
      )
      return done.ok ? null : done.error
    } catch (e) {
      return e instanceof TimeoutError ? 'tardó demasiado' : 'falló la subida'
    }
  }

  /**
   * Varias fotos a la vez: EN FILA (no en paralelo), para no saturar una conexión lenta y que cada
   * una tome su posición en orden. Las que no caben (máx. 8) quedan fuera; un error no frena al resto.
   */
  async function onPick(list: FileList | null) {
    const files = list ? Array.from(list) : []
    if (files.length === 0) return
    const { toUpload, skipped } = planGalleryUpload(files, count, MAX)

    setBusy('add')
    setError(null)
    const failed: { name: string; error: string }[] = []
    try {
      for (const [i, file] of toUpload.entries()) {
        setProgress({ current: i + 1, total: toUpload.length })
        const err = await uploadOne(file)
        if (err) failed.push({ name: file.name, error: err })
      }
      const refreshed = await withTimeout(listGalleryAction({ productId }), STEP_MS)
      if (refreshed.ok) setPhotos(refreshed.photos)
    } catch {
      // Solo falló el refresco de la lista: las fotos ya subidas se verán al reabrir
    } finally {
      setError(galleryUploadSummary(failed, skipped))
      setProgress(null)
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
        onBusyChange={setMainBusy}
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
            multiple
            onChange={(e) => onPick(e.currentTarget.files)}
          />
          <button
            type="button"
            disabled={busy !== null || photos === null || count >= MAX}
            onClick={() => inputRef.current?.click()}
            className={BTN}
          >
            {busy === 'add'
              ? progress && progress.total > 1
                ? `Subiendo ${progress.current} de ${progress.total}…`
                : 'Subiendo…'
              : 'Agregar fotos'}
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
        ) : loadFailed ? null : (
          <ul aria-busy="true" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <li className="sr-only">Cargando fotos…</li>
            {[0, 1, 2].map((k) => (
              <li
                key={k}
                aria-hidden="true"
                className="aspect-[3/2] w-full animate-pulse rounded-ctl bg-surface-2"
              />
            ))}
          </ul>
        )}

        {error ? (
          <p role="alert" className="text-bad text-xs">
            {error}
          </p>
        ) : null}
      </section>
    </div>
  )
}
