import Link from 'next/link'

const BTN =
  'inline-flex h-10 items-center rounded-ctl border border-line px-4 font-medium text-sm hover:bg-surface-2'
const OFF = 'inline-flex h-10 items-center rounded-ctl border border-line px-4 text-sm opacity-50'

/** Paginación por enlaces (páginas de servidor sin estado de cliente, p. ej. el detalle de un producto). */
export function PageLinks({
  page,
  hasNext,
  hrefFor,
}: {
  page: number
  hasNext: boolean
  hrefFor: (page: number) => string
}) {
  if (page <= 1 && !hasNext) return null
  return (
    <nav aria-label="Paginación" className="flex items-center justify-between gap-2.5">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={BTN}>
          Anterior
        </Link>
      ) : (
        <span aria-disabled="true" className={OFF}>
          Anterior
        </span>
      )}
      <span className="text-muted text-sm">Página {page}</span>
      {hasNext ? (
        <Link href={hrefFor(page + 1)} className={BTN}>
          Siguiente
        </Link>
      ) : (
        <span aria-disabled="true" className={OFF}>
          Siguiente
        </span>
      )}
    </nav>
  )
}
