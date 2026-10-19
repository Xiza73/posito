/** Reparte la selección entre lo que cabe en la galería y lo que queda fuera (se respeta el orden). */
export function planGalleryUpload<T>(files: readonly T[], used: number, max: number) {
  const room = Math.max(0, max - used)
  return { toUpload: files.slice(0, room), skipped: files.length - Math.min(files.length, room) }
}

/** Mensaje final de una subida múltiple: null si todo salió bien. */
export function galleryUploadSummary(
  failed: readonly { name: string; error: string }[],
  skipped: number,
): string | null {
  const parts: string[] = []
  if (failed.length === 1) parts.push(`No se pudo subir "${failed[0].name}": ${failed[0].error}`)
  else if (failed.length > 1)
    parts.push(
      `No se pudieron subir ${failed.length} fotos: ${failed.map((f) => f.name).join(', ')}.`,
    )
  if (skipped > 0)
    parts.push(
      skipped === 1
        ? 'Una foto quedó fuera: máximo 8 fotos extra.'
        : `${skipped} fotos quedaron fuera: máximo 8 fotos extra.`,
    )
  return parts.length > 0 ? parts.join(' ') : null
}
