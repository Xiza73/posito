import Link from 'next/link'

const TAB =
  'inline-flex h-10 items-center border-b-2 px-4 font-medium text-sm aria-[current=page]:border-accent aria-[current=page]:text-ink border-transparent text-muted hover:text-ink'

/** Pestañas Productos | Categorías. Categorías solo se muestra a quien puede gestionarlas. */
export function ProductosTabs({
  active,
  showCategories,
}: {
  active: 'productos' | 'categorias'
  showCategories: boolean
}) {
  if (!showCategories) return null
  return (
    <nav aria-label="Secciones de productos" className="flex border-line border-b">
      <Link
        href="/productos"
        className={TAB}
        aria-current={active === 'productos' ? 'page' : undefined}
      >
        Productos
      </Link>
      <Link
        href="/productos/categorias"
        className={TAB}
        aria-current={active === 'categorias' ? 'page' : undefined}
      >
        Categorías
      </Link>
    </nav>
  )
}
