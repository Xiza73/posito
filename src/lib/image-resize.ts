// Reducción de fotos en el navegador antes de subirlas (evita el límite de cuerpo de las Server
// Actions y el costo de almacenar fotos de 8 MB). La matemática es pura y está testeada; la parte
// de canvas depende del navegador y no se prueba en jsdom.

export const IMAGE_INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const IMAGE_INPUT_MAX_BYTES = 15 * 1024 * 1024
const WEBP_QUALITY = 0.8

/** Mensaje de error si el archivo elegido no sirve, o null si es válido. */
export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!(IMAGE_INPUT_TYPES as readonly string[]).includes(file.type)) {
    return 'Elige una imagen JPG, PNG o WebP'
  }
  if (file.size === 0) return 'El archivo está vacío'
  if (file.size > IMAGE_INPUT_MAX_BYTES) return 'La imagen supera los 15 MB'
  return null
}

/** Cabe en un cuadrado `max` × `max` manteniendo la proporción; nunca agranda. */
export function fitWithin(width: number, height: number, max: number) {
  if (!(width > 0) || !(height > 0)) throw new RangeError('Dimensiones inválidas')
  const scale = Math.min(1, max / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Decodifica y reescala a WebP. Lanza si el navegador no decodifica o no sabe codificar WebP. */
export async function resizeToWebp(file: Blob, max: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, max)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas no disponible')
    ctx.drawImage(bitmap, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY),
    )
    // Navegadores sin soporte de WebP en canvas devuelven PNG: no se sube otra cosa
    if (blob?.type !== 'image/webp') throw new Error('webp no soportado')
    return blob
  } finally {
    bitmap.close()
  }
}
