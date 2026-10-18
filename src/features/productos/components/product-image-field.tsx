'use client'

import { useRef, useState } from 'react'
import { ProductThumb } from '@/components/product-thumb'
import { IMAGE_INPUT_TYPES, resizeToWebp, validateImageFile } from '@/lib/image-resize'
import { IMAGE_LARGE_SIZE, IMAGE_THUMB_SIZE } from '@/lib/product-image'
import { TimeoutError, uploadToSignedUrl, withTimeout } from '@/lib/with-timeout'
import { confirmProductImage, removeProductImage, requestProductImageUpload } from '../actions'

type Props = {
  productId: string
  productName: string
  imageBase: string
  path: string | null
  onPathChange: (path: string | null) => void
  /** Avisa al formulario para bloquearlo entero mientras se sube o quita. */
  onBusyChange?: (busy: boolean) => void
}

const STEP_MS = 30_000
const TOO_SLOW = 'La subida tardó demasiado. Revisa tu conexión e inténtalo de nuevo.'

/** Foto del producto: sube/cambia/quita directo contra Storage; no forma parte del form de datos. */
export function ProductImageField({
  productId,
  productName,
  imageBase,
  path,
  onPathChange: setPath,
  onBusyChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusyState] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function setBusy(value: boolean) {
    setBusyState(value)
    onBusyChange?.(value)
  }

  async function onPick(file: File | undefined) {
    if (!file) return
    const invalid = validateImageFile(file)
    if (invalid) return setError(invalid)

    setBusy(true)
    setError(null)
    try {
      let large: Blob
      let thumb: Blob
      try {
        ;[large, thumb] = await withTimeout(
          Promise.all([resizeToWebp(file, IMAGE_LARGE_SIZE), resizeToWebp(file, IMAGE_THUMB_SIZE)]),
          STEP_MS,
        )
      } catch {
        return setError('No se pudo leer la imagen. Prueba con otra foto.')
      }
      const signed = await withTimeout(requestProductImageUpload({ productId }), STEP_MS)
      if (!signed.ok) return setError(signed.error)
      try {
        await Promise.all([
          uploadToSignedUrl(signed.largeUrl, large),
          uploadToSignedUrl(signed.thumbUrl, thumb),
        ])
      } catch (e) {
        return setError(
          e instanceof TimeoutError
            ? TOO_SLOW
            : 'No se pudo subir la foto. Revisa tu conexión e inténtalo de nuevo.',
        )
      }
      const done = await withTimeout(
        confirmProductImage({ productId, basePath: signed.basePath }),
        STEP_MS,
      )
      if (!done.ok) return setError(done.error)
      setPath(done.imagePath)
    } catch (e) {
      // Nunca dejar la UI colgada: timeout o error inesperado (p. ej. de red en la Server Action)
      setError(
        e instanceof TimeoutError ? TOO_SLOW : 'No se pudo subir la foto. Inténtalo de nuevo.',
      )
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function onRemove() {
    setBusy(true)
    setError(null)
    try {
      const done = await withTimeout(removeProductImage({ productId }), STEP_MS)
      if (!done.ok) return setError(done.error)
      setPath(done.imagePath)
    } catch (e) {
      setError(
        e instanceof TimeoutError ? TOO_SLOW : 'No se pudo quitar la foto. Inténtalo de nuevo.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3.5">
      <ProductThumb
        imageBase={imageBase}
        imagePath={path}
        name={productName}
        size={240}
        width={96}
        height={64}
        className="h-16 w-24 flex-none rounded-ctl"
      />
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-muted text-sm">Foto</span>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            id="pf-image"
            type="file"
            accept={IMAGE_INPUT_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => onPick(e.currentTarget.files?.[0])}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="h-9 cursor-pointer rounded-ctl border border-line px-3 font-medium text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Subiendo…' : path ? 'Cambiar foto' : 'Subir foto'}
          </button>
          {path ? (
            <button
              type="button"
              disabled={busy}
              onClick={onRemove}
              className="h-9 cursor-pointer rounded-ctl border border-line px-3 font-medium text-sm hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Quitar
            </button>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-bad text-xs">
            {error}
          </p>
        ) : (
          <span className="text-muted text-xs">JPG, PNG o WebP, hasta 15 MB</span>
        )}
      </div>
    </div>
  )
}
