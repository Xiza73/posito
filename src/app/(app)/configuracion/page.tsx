import { NoPermission } from '@/components/ui/no-permission'
import { PlaceholderPage } from '@/components/ui/placeholder-page'
import { can } from '@/lib/permissions'
import { getCurrentMember } from '@/lib/session'

export default async function ConfiguracionPage() {
  const { member } = await getCurrentMember()
  if (!can(member.role, { organization: ['update'] })) return <NoPermission title="Configuración" />

  return <PlaceholderPage title="Configuración" />
}
