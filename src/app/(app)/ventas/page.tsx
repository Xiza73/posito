import { SalesView } from '@/features/ventas/components/sales-view'
import {
  listCashiers,
  listProductOptions,
  listSales,
  type SalesScope,
  salesSummary,
} from '@/features/ventas/data/sales'
import { parseSalesSearchParams } from '@/features/ventas/lib/filters'
import { db } from '@/lib/db'
import { todayInLima } from '@/lib/lima-time'
import { seesAllSales } from '@/lib/permissions'
import { getCurrentMember } from '@/lib/session'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function VentasPage({ searchParams }: { searchParams: SearchParams }) {
  // Bodega y rol salen de la sesión; el layout no basta (no se re-ejecuta en navegación cliente).
  const { member, organization, user } = await getCurrentMember()
  const now = new Date()
  const { filters, page } = parseSalesSearchParams(await searchParams, now)

  // Admin/propietario ven todo (y pueden filtrar por cajero); el cajero, solo lo suyo.
  // El filtro real vive en la capa de datos; aquí solo se evita mostrar un filtro que no aplica.
  const seesAll = seesAllSales(member.role)
  const scope: SalesScope = {
    orgId: organization.id,
    viewer: { userId: user.id, role: member.role },
    filters: seesAll ? filters : { ...filters, cashierId: undefined },
  }

  const [list, summary, products, cashiers] = await Promise.all([
    listSales(db, { ...scope, page }),
    salesSummary(db, scope),
    listProductOptions(db, organization.id),
    seesAll ? listCashiers(db, organization.id) : Promise.resolve(null),
  ])

  return (
    <div className="flex animate-fade-up flex-col gap-4 p-4 md:px-7 md:py-6">
      <h2 className="font-semibold text-lg">Ventas</h2>
      <SalesView
        rows={list.rows}
        summary={summary}
        filters={scope.filters}
        page={list.page}
        hasNext={list.hasNext}
        today={todayInLima(now)}
        products={products}
        cashiers={cashiers}
      />
    </div>
  )
}
