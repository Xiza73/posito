import { type ImageSize, productImageUrl } from '@/lib/product-image'

type Props = {
  /** Base pública de lectura (publicImageBase) o null si Storage no está configurado. */
  imageBase: string | null
  imagePath: string | null
  name: string
  size?: ImageSize
  /** Dimensiones intrínsecas (evitan saltos de diseño); el CSS las ajusta. */
  width: number
  height: number
  className?: string
}

const PLACEHOLDER =
  'bg-[repeating-linear-gradient(135deg,var(--surface2)_0_6px,transparent_6px_12px)]'

/** Foto del producto (miniatura 240 por defecto) o el placeholder rayado. <img> plano: ya viene reducida. */
export function ProductThumb({
  imageBase,
  imagePath,
  name,
  size = 240,
  width,
  height,
  className = '',
}: Props) {
  const src = productImageUrl(imageBase, imagePath, size)
  if (!src) {
    return <div aria-hidden="true" className={`border border-line ${PLACEHOLDER} ${className}`} />
  }
  return (
    // biome-ignore lint/performance/noImgElement: imágenes ya reducidas en el cliente; evita la cuota de next/image
    <img
      src={src}
      alt={name}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      className={`border border-line bg-surface-2 object-cover ${className}`}
    />
  )
}
