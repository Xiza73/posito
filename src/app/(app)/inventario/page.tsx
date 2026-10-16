import { InventarioTabs } from '@/features/inventario/components/inventario-tabs'
import { StockView } from '@/features/inventario/components/stock-view'
import {
  listAdjustableProducts,
  listCategoryOptions,
  listStock,
  stockSummary,
} from '@/features/inventario/data/inventory'
import { parseStockSearchParams } from '@/features/inventario/lib/filters'
import { db } from '@/lib/db'
import { can } from '@/lib/permissions'
import { getCurrentMember } from '@/lib/session'

// Señal de stock bajo en el menú lateral: pendiente a propósito. Inicio mostrará las alertas.

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function InventarioPage({ searchParams }: { searchParams: SearchParams }) {
  // La bodega sale de la sesión; el layout no basta (no se re-ejecuta en navegación cliente).
  const { member, organization } = await getCurrentMember()
  // Todos ven el stock; ingresar, ajustar y contar exige stock:adjust (también en el servidor)
  const canAdjust = can(member.role, { stock: ['adjust'] })
  const filters = parseStockSearchParams(await searchParams, canAdjust)

  const [rows, summary, categories, adjustable] = await Promise.all([
    listStock(db, { orgId: organization.id, filters }),
    stockSummary(db, organization.id),
    listCategoryOptions(db, organization.id),
    canAdjust ? listAdjustableProducts(db, organization.id) : Promise.resolve([]),
  ])

  return (
    <div className="flex animate-fade-up flex-col gap-4 p-4 md:px-7 md:py-6">
      <h2 className="font-semibold text-lg">Inventario</h2>
      <InventarioTabs active="stock" />
      <StockView
        rows={rows}
        summary={summary}
        filters={filters}
        categories={categories}
        canAdjust={canAdjust}
        adjustable={adjustable}
      />
    </div>
  )
}
