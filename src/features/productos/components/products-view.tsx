'use client'

import { useState, useTransition } from 'react'
import type { ProductRow } from '../data/products'
import { ImportDialog } from './import-dialog'
import { ProductFilters } from './product-filters'
import { ProductFormDialog } from './product-form-dialog'
import { ProductsList } from './products-list'

type Props = {
  products: ProductRow[]
  categories: { id: string; name: string }[]
  filters: { query: string; categoryId: string; includeInactive: boolean }
  perms: { create: boolean; update: boolean; delete: boolean }
  /** Ve y edita el costo (owner/admin); si es false, `products` ni trae el costo. */
  showCost: boolean
  /** Base pública de las fotos (publicImageBase) o null. */
  imageBase: string | null
}

/** Orquesta filtros, lista y el diálogo de alta/edición. */
export function ProductsView({ products, categories, filters, perms, showCost, imageBase }: Props) {
  const [target, setTarget] = useState<ProductRow | 'new' | null>(null)
  const [importing, setImporting] = useState(false)
  // Mientras llega la lista nueva, la actual está obsoleta: no se puede actuar sobre sus filas.
  const [isPending, startTransition] = useTransition()

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <ProductFilters
          // Inputs no controlados: remontar si la URL cambia (ej. botón "atrás") para no desincronizar
          key={`${filters.query}|${filters.categoryId}|${filters.includeInactive}`}
          {...filters}
          categories={categories}
          showInactiveFilter={perms.update}
          startTransition={startTransition}
        />
        {perms.create ? (
          <>
            <button
              type="button"
              onClick={() => setTarget('new')}
              className="h-11 cursor-pointer rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm"
            >
              Nuevo producto
            </button>
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="h-11 cursor-pointer rounded-ctl border border-line px-4 font-medium text-sm hover:bg-surface-2"
            >
              Importar
            </button>
          </>
        ) : null}
      </div>

      <div
        aria-busy={isPending}
        inert={isPending}
        className={`flex flex-col gap-2.5 transition-opacity ${isPending ? 'opacity-50' : ''}`}
      >
        {isPending ? (
          <p role="status" className="text-muted text-sm">
            Cargando…
          </p>
        ) : null}
        <ProductsList
          products={products}
          canUpdate={perms.update}
          canDelete={perms.delete}
          showCost={showCost}
          onEdit={setTarget}
          imageBase={imageBase}
        />
      </div>

      {importing ? <ImportDialog onClose={() => setImporting(false)} /> : null}

      {perms.create || perms.update ? (
        <ProductFormDialog
          target={target}
          categories={categories.map((c) => c.name)}
          imageBase={imageBase}
          showCost={showCost}
          onClose={() => setTarget(null)}
        />
      ) : null}
    </>
  )
}
