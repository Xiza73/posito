import { NoPermission } from '@/components/ui/no-permission'
import { MembersList } from '@/features/usuarios/components/members-list'
import { NewUserDialog } from '@/features/usuarios/components/new-user-dialog'
import { listMembers } from '@/features/usuarios/data/members'
import { can } from '@/lib/permissions'
import { getCurrentMember } from '@/lib/session'

export default async function UsuariosPage() {
  const { member, organization } = await getCurrentMember()
  // Guard de servidor: ocultar el link no basta, la ruta se pide directo.
  if (!can(member.role, { member: ['create'] })) return <NoPermission title="Usuarios" />

  const members = await listMembers(organization.id)

  return (
    <div className="flex animate-fade-up flex-col gap-4 p-4 md:px-7 md:py-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-lg">Usuarios</h2>
        <NewUserDialog />
      </div>
      <MembersList members={members} currentMemberId={member.id} />
    </div>
  )
}
