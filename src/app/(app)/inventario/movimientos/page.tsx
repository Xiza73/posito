import { InventarioTabs } from '@/features/inventario/components/inventario-tabs'
import { MovementsView } from '@/features/inventario/components/movements-view'
import {
  listMovements,
  listMovementUsers,
  listProductOptions,
} from '@/features/inventario/data/inventory'
import { parseMovementSearchParams } from '@/features/inventario/lib/filters'
import { db } from '@/lib/db'
import { todayInLima } from '@/lib/lima-time'
import { can, seesAllSales } from '@/lib/permissions'
import { getCurrentMember } from '@/lib/session'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function MovimientosPage({ searchParams }: { searchParams: SearchParams }) {
  const { member, organization, user } = await getCurrentMember()
  const now = new Date()
  const parsed = parseMovementSearchParams(await searchParams, now)
  // Solo quien gestiona el stock filtra por usuario; para el resto se ignora el parámetro
  const canFilterUsers = can(member.role, { stock: ['adjust'] })
  const filters = canFilterUsers ? parsed.filters : { ...parsed.filters, userId: undefined }

  const [list, products, users] = await Promise.all([
    listMovements(db, { orgId: organization.id, filters, page: parsed.page }),
    listProductOptions(db, organization.id),
    canFilterUsers ? listMovementUsers(db, organization.id) : Promise.resolve(null),
  ])

  return (
    <div className="flex animate-fade-up flex-col gap-4 p-4 md:px-7 md:py-6">
      <h2 className="font-semibold text-lg">Inventario</h2>
      <InventarioTabs active="movimientos" />
      <MovementsView
        rows={list.rows}
        filters={filters}
        page={list.page}
        hasNext={list.hasNext}
        today={todayInLima(now)}
        products={products}
        users={users}
        viewer={{ userId: user.id, seesAllSales: seesAllSales(member.role) }}
      />
    </div>
  )
}
