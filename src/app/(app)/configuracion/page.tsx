import { NoPermission } from '@/components/ui/no-permission'
import { BusinessProfileForm } from '@/features/configuracion/components/business-profile-form'
import { ReceiptSeriesForm } from '@/features/configuracion/components/receipt-series-form'
import { SaleApprovalForm } from '@/features/configuracion/components/sale-approval-form'
import { getReceiptSeries } from '@/features/configuracion/data/receipt-series'
import { db } from '@/lib/db'
import { can } from '@/lib/permissions'
import { getCurrentMember } from '@/lib/session'
import { getBusinessProfile, getSettings } from '@/lib/settings'

export default async function ConfiguracionPage() {
  const { member, organization } = await getCurrentMember()
  if (!can(member.role, { organization: ['update'] })) return <NoPermission title="Configuración" />

  const [{ series, nextNumber }, settings, profile] = await Promise.all([
    getReceiptSeries(db, organization.id),
    getSettings(db, organization.id),
    getBusinessProfile(db, organization.id),
  ])

  return (
    <div className="flex animate-fade-up flex-col gap-4 p-4 md:px-7 md:py-6">
      <h2 className="font-semibold text-lg">Configuración</h2>
      <BusinessProfileForm profile={profile} />
      <ReceiptSeriesForm series={series} nextNumber={nextNumber} />
      <SaleApprovalForm requireSaleApproval={settings.requireSaleApproval} />
      <p className="max-w-3xl text-muted text-sm">
        El tema (Cielo o Café) se cambia desde el encabezado.
      </p>
    </div>
  )
}
