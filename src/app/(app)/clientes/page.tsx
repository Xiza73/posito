import { CustomersView } from '@/features/clientes/components/customers-view'
import { listCustomers } from '@/features/clientes/data/customers'
import { parseCustomersSearchParams } from '@/features/clientes/lib/filters'
import { db } from '@/lib/db'
import { can, seesAllSales } from '@/lib/permissions'
import { getCurrentMember } from '@/lib/session'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function ClientesPage({ searchParams }: { searchParams: SearchParams }) {
  // Bodega y rol salen de la sesión; el layout no basta (no se re-ejecuta en navegación cliente).
  const { member, organization, user } = await getCurrentMember()

  const perms = {
    create: can(member.role, { customer: ['create'] }),
    // Desactivar y reactivar: solo quien puede ver también los inactivos
    delete: can(member.role, { customer: ['delete'] }),
    // Exportar datos personales en bloque: solo administración (misma regla que ver todas las ventas)
    export: seesAllSales(member.role),
  }
  const { filters, page } = parseCustomersSearchParams(await searchParams, perms.delete)

  const list = await listCustomers(db, {
    orgId: organization.id,
    viewer: { userId: user.id, role: member.role },
    query: filters.query,
    includeInactive: filters.includeInactive,
    page,
  })

  return (
    <div className="flex animate-fade-up flex-col gap-4 p-4 md:px-7 md:py-6">
      <h2 className="font-semibold text-lg">Clientes</h2>
      <CustomersView
        rows={list.rows}
        filters={filters}
        page={list.page}
        hasNext={list.hasNext}
        perms={perms}
      />
    </div>
  )
}
