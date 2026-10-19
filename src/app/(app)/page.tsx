import { Alerts } from '@/features/inicio/components/alerts'
import { DashboardFrame } from '@/features/inicio/components/dashboard-frame'
import { KpiTiles } from '@/features/inicio/components/kpi-tiles'
import { PaymentBreakdown, TopProducts } from '@/features/inicio/components/payment-and-top'
import { SalesChart } from '@/features/inicio/components/sales-chart'
import { getDashboard } from '@/features/inicio/data/dashboard'
import { parsePeriod } from '@/features/inicio/lib/period'
import { db } from '@/lib/db'
import { addDays } from '@/lib/lima-time'
import { getCurrentMember } from '@/lib/session'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function InicioPage({ searchParams }: { searchParams: SearchParams }) {
  // Bodega y rol salen de la sesión; el layout no basta (no se re-ejecuta en navegación cliente).
  const { member, organization, user } = await getCurrentMember()
  const period = parsePeriod((await searchParams).periodo)

  // El alcance (cajero = solo lo suyo) lo impone la capa de datos
  const d = await getDashboard(db, {
    orgId: organization.id,
    viewer: { userId: user.id, role: member.role },
    period,
  })

  // Las pendientes no son del período: el enlace abarca el último año (rango máximo de Ventas)
  const pendingHref = `/ventas?estado=pendiente&desde=${addDays(d.today, -365)}&hasta=${d.today}`
  const voidedHref = `/ventas?estado=anulada&desde=${d.range.from}&hasta=${d.range.to}`
  const editedHref = `/ventas?editado=1&desde=${d.range.from}&hasta=${d.range.to}`

  return (
    <div className="flex animate-fade-up flex-col gap-4 p-4 md:px-7 md:py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="font-semibold text-lg">Inicio</h2>
        {d.ownSalesOnly ? <p className="text-muted text-sm">Tus ventas</p> : null}
      </div>

      <DashboardFrame period={period}>
        <KpiTiles period={period} totals={d.totals} changes={d.changes} />

        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <SalesChart kind={d.buckets.kind} items={d.buckets.items} empty={d.totals.count === 0} />
          <PaymentBreakdown byMethod={d.byMethod} totalCents={d.totals.totalCents} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <TopProducts products={d.topProducts} />
          <Alerts
            stock={d.stock}
            pendingCount={d.pendingCount}
            voidedCount={d.voidedCount}
            pendingHref={pendingHref}
            voidedHref={voidedHref}
            editedPrices={d.editedPrices}
            editedHref={editedHref}
          />
        </div>
      </DashboardFrame>
    </div>
  )
}
