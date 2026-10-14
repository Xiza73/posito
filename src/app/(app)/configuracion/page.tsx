import { NoPermission } from '@/components/ui/no-permission'
import { ReceiptSeriesForm } from '@/features/configuracion/components/receipt-series-form'
import { getReceiptSeries } from '@/features/configuracion/data/receipt-series'
import { db } from '@/lib/db'
import { can } from '@/lib/permissions'
import { getCurrentMember } from '@/lib/session'

export default async function ConfiguracionPage() {
  const { member, organization } = await getCurrentMember()
  if (!can(member.role, { organization: ['update'] })) return <NoPermission title="Configuración" />

  const { series, nextNumber } = await getReceiptSeries(db, organization.id)

  return (
    <div className="flex animate-fade-up flex-col gap-4 p-4 md:px-7 md:py-6">
      <h2 className="font-semibold text-lg">Configuración</h2>
      <ReceiptSeriesForm series={series} nextNumber={nextNumber} />
      <p className="max-w-3xl text-muted text-sm">
        El tema (Cielo o Café) se cambia desde el encabezado.
      </p>
    </div>
  )
}
