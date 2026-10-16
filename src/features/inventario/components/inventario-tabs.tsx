import Link from 'next/link'

const TAB =
  'inline-flex h-10 items-center border-b-2 px-4 font-medium text-sm aria-[current=page]:border-accent aria-[current=page]:text-ink border-transparent text-muted hover:text-ink'

/** Pestañas Stock | Movimientos (el detalle de un producto cuelga de Stock). */
export function InventarioTabs({ active }: { active: 'stock' | 'movimientos' }) {
  return (
    <nav aria-label="Secciones de inventario" className="flex border-line border-b">
      <Link
        href="/inventario"
        className={TAB}
        aria-current={active === 'stock' ? 'page' : undefined}
      >
        Stock
      </Link>
      <Link
        href="/inventario/movimientos"
        className={TAB}
        aria-current={active === 'movimientos' ? 'page' : undefined}
      >
        Movimientos
      </Link>
    </nav>
  )
}
