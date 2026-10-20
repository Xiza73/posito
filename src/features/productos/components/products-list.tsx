import { ProductThumb } from '@/components/product-thumb'
import { StockBadge } from '@/components/ui/stock-badge'
import { formatCents } from '@/lib/format'
import type { ProductRow } from '../data/products'
import { computeMargin, formatMargin } from '../lib/margin'
import { ToggleActiveButton } from './toggle-active-button'

type Props = {
  products: ProductRow[]
  canUpdate: boolean
  canDelete: boolean
  showCost: boolean
  onEdit: (product: ProductRow) => void
  imageBase: string | null
}

const TH = 'px-4 py-3 font-medium'

function Thumb({ p, imageBase }: { p: ProductRow; imageBase: string | null }) {
  return (
    <ProductThumb
      imageBase={imageBase}
      imagePath={p.imagePath}
      name={p.name}
      width={48}
      height={48}
      className="size-12 flex-none rounded-ctl"
    />
  )
}

/** Margen para administración: gris si es positivo, aviso si costo >= precio; "—" sin costo. */
function MarginLine({ p }: { p: ProductRow }) {
  const margin = computeMargin(p.priceCents, p.costCents ?? null)
  return (
    <div className={`text-xs ${margin?.warning ? 'text-bad' : 'text-muted'}`}>
      {formatMargin(margin, formatCents)}
    </div>
  )
}

function WholesaleTag() {
  return (
    <span className="ml-2 rounded-full border border-accent px-2 py-0.5 font-normal text-accent text-xs">
      Por mayor
    </span>
  )
}

function HiddenInStoreTag() {
  return (
    <span className="ml-2 rounded-full border border-line px-2 py-0.5 font-normal text-muted text-xs">
      Oculto en tienda
    </span>
  )
}

function InactiveTag() {
  return (
    <span className="ml-2 rounded-full border border-line px-2 py-0.5 font-normal text-muted text-xs">
      Inactivo
    </span>
  )
}

type ActionProps = Pick<Props, 'canUpdate' | 'canDelete' | 'onEdit'>

function Actions({ p, canUpdate, canDelete, onEdit }: { p: ProductRow } & ActionProps) {
  // Desactivar pide product:delete; reactivar y editar piden product:update.
  const canToggle = p.active ? canDelete : canUpdate
  if (!canUpdate && !canToggle) return null
  return (
    <div className="flex items-start justify-end gap-2">
      {canUpdate ? (
        <button
          type="button"
          onClick={() => onEdit(p)}
          aria-label={`Editar ${p.name}`}
          className="h-9 cursor-pointer rounded-ctl border border-line px-3 font-medium text-sm hover:bg-surface-2"
        >
          Editar
        </button>
      ) : null}
      {canToggle ? <ToggleActiveButton id={p.id} name={p.name} active={p.active} /> : null}
    </div>
  )
}

/** Tabla en md+ y tarjetas en móvil. */
export function ProductsList({ products, imageBase, ...actions }: Props) {
  const showActions = actions.canUpdate || actions.canDelete

  if (products.length === 0) {
    return (
      <p className="rounded-card border border-line bg-surface p-8 text-center text-muted text-sm">
        No hay productos para mostrar.
      </p>
    )
  }

  return (
    <>
      <table className="hidden w-full overflow-hidden rounded-card border border-line bg-surface text-left text-sm md:table">
        <thead className="bg-surface-2 text-muted">
          <tr>
            <th scope="col" className={TH}>
              Producto
            </th>
            <th scope="col" className={TH}>
              Categoría
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Stock
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Precio
            </th>
            {showActions ? (
              <th scope="col" className={`${TH} text-right`}>
                <span className="sr-only">Acciones</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className={`border-line border-t ${p.active ? '' : 'opacity-60'}`}>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Thumb p={p} imageBase={imageBase} />
                  <div>
                    <div className="font-medium">
                      {p.name}
                      {p.tiers.length > 0 ? <WholesaleTag /> : null}
                      {p.active ? null : <InactiveTag />}
                      {p.showInStore ? null : <HiddenInStoreTag />}
                    </div>
                    {p.barcode ? (
                      <div className="font-mono text-muted text-xs">{p.barcode}</div>
                    ) : null}
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-muted">{p.categoryName ?? '—'}</td>
              <td className="px-4 py-3 text-right">
                <StockBadge {...p} />
              </td>
              <td className="px-4 py-3 text-right">
                <div className="font-mono">{formatCents(p.priceCents)}</div>
                {actions.showCost ? <MarginLine p={p} /> : null}
              </td>
              {showActions ? (
                <td className="px-4 py-3">
                  <Actions p={p} {...actions} />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="flex flex-col gap-2.5 md:hidden">
        {products.map((p) => (
          <li
            key={p.id}
            className={`flex flex-col gap-3 rounded-card border border-line bg-surface p-4 ${
              p.active ? '' : 'opacity-60'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <Thumb p={p} imageBase={imageBase} />
                <div className="min-w-0">
                  <div className="font-medium">
                    {p.name}
                    {p.tiers.length > 0 ? <WholesaleTag /> : null}
                    {p.active ? null : <InactiveTag />}
                    {p.showInStore ? null : <HiddenInStoreTag />}
                  </div>
                  <div className="text-muted text-xs">
                    {p.categoryName ?? 'Sin categoría'}
                    {p.barcode ? <span className="font-mono"> · {p.barcode}</span> : null}
                  </div>
                </div>
              </div>
              <div className="flex flex-none flex-col items-end gap-0.5">
                <span className="font-mono text-sm">{formatCents(p.priceCents)}</span>
                {actions.showCost ? <MarginLine p={p} /> : null}
                <StockBadge {...p} />
              </div>
            </div>
            {showActions ? <Actions p={p} {...actions} /> : null}
          </li>
        ))}
      </ul>
    </>
  )
}
