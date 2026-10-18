import { NoPermission } from '@/components/ui/no-permission'
import { BusinessProfileForm } from '@/features/configuracion/components/business-profile-form'
import { ManualPriceForm } from '@/features/configuracion/components/manual-price-form'
import { ReceiptSeriesForm } from '@/features/configuracion/components/receipt-series-form'
import { SaleApprovalForm } from '@/features/configuracion/components/sale-approval-form'
import { StoreSettingsForm } from '@/features/configuracion/components/store-settings-form'
import { getReceiptSeries } from '@/features/configuracion/data/receipt-series'
import { db } from '@/lib/db'
import { can } from '@/lib/permissions'
import { getCurrentMember } from '@/lib/session'
import { getBusinessProfile, getSettings } from '@/lib/settings'
import { countStoreProducts, getStoreSettings } from '@/lib/store-settings'
import { normalizeWhatsappNumber } from '@/lib/whatsapp-phone'

export default async function ConfiguracionPage() {
  const { member, organization } = await getCurrentMember()
  if (!can(member.role, { organization: ['update'] })) return <NoPermission title="Configuración" />

  const [{ series, nextNumber }, settings, profile, store, publishedCount] = await Promise.all([
    getReceiptSeries(db, organization.id),
    getSettings(db, organization.id),
    getBusinessProfile(db, organization.id),
    getStoreSettings(db, organization.id),
    countStoreProducts(db, organization.id),
  ])

  return (
    <div className="flex animate-fade-up flex-col gap-4 p-4 md:px-7 md:py-6">
      <h2 className="font-semibold text-lg">Configuración</h2>
      <BusinessProfileForm profile={profile} />
      <ReceiptSeriesForm series={series} nextNumber={nextNumber} />
      <SaleApprovalForm requireSaleApproval={settings.requireSaleApproval} />
      <ManualPriceForm allowManualPrice={settings.allowManualPrice} />
      <StoreSettingsForm
        settings={store}
        publishedCount={publishedCount}
        hasPhone={Boolean(profile.phone)}
        phoneIsValid={normalizeWhatsappNumber(profile.phone) !== null}
      />
      <p className="max-w-3xl text-muted text-sm">
        El tema (Cielo o Café) se cambia desde el encabezado.
      </p>
    </div>
  )
}
