const PLACEHOLDER =
  'bg-[repeating-linear-gradient(135deg,var(--surface2)_0_6px,transparent_6px_12px)]'

/** Foto a partir de una URL pública ya resuelta en el servidor (o placeholder rayado si es null). */
export function StoreImage({
  src,
  name,
  width,
  height,
  className = '',
  eager = false,
}: {
  src: string | null
  name: string
  width: number
  height: number
  className?: string
  eager?: boolean
}) {
  if (!src) {
    return <div aria-hidden="true" className={`border border-line ${PLACEHOLDER} ${className}`} />
  }
  return (
    // biome-ignore lint/performance/noImgElement: imágenes ya reducidas; evita la cuota de next/image
    <img
      src={src}
      alt={name}
      width={width}
      height={height}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={`border border-line bg-surface-2 object-cover ${className}`}
    />
  )
}
