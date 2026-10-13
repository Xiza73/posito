import { roleLabel } from '@/lib/permissions'
import type { MemberRow } from '../data/members'
import { RoleForm } from './role-form'

const dateFmt = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeZone: 'America/Lima' })

type Props = { members: MemberRow[]; currentMemberId: string }

/** El rol solo es editable para miembros que no son propietario/a ni uno mismo. */
function RoleCell({ m, currentMemberId }: { m: MemberRow; currentMemberId: string }) {
  const editable = m.id !== currentMemberId && !m.role.split(',').includes('owner')
  return editable ? <RoleForm memberId={m.id} role={m.role} /> : <span>{roleLabel(m.role)}</span>
}

/** Tabla en md+ y tarjetas en móvil. */
export function MembersList({ members, currentMemberId }: Props) {
  return (
    <>
      <table className="hidden w-full overflow-hidden rounded-card border border-line bg-surface text-left text-sm md:table">
        <thead className="bg-surface-2 text-muted">
          <tr>
            <th scope="col" className="px-4 py-3 font-medium">
              Nombre
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Correo
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Rol
            </th>
            <th scope="col" className="px-4 py-3 font-medium">
              Alta
            </th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.id} className="border-line border-t">
              <td className="px-4 py-3 font-medium">
                {m.name}
                {m.id === currentMemberId ? (
                  <span className="ml-2 text-muted text-xs">(tú)</span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-muted">{m.email}</td>
              <td className="px-4 py-3">
                <RoleCell m={m} currentMemberId={currentMemberId} />
              </td>
              <td className="px-4 py-3 text-muted">{dateFmt.format(m.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="flex flex-col gap-3 md:hidden">
        {members.map((m) => (
          <li key={m.id} className="rounded-card border border-line bg-surface p-4">
            <div className="font-medium">
              {m.name}
              {m.id === currentMemberId ? (
                <span className="ml-2 text-muted text-xs">(tú)</span>
              ) : null}
            </div>
            <div className="text-muted text-sm">{m.email}</div>
            <div className="mt-3 text-sm">
              <RoleCell m={m} currentMemberId={currentMemberId} />
            </div>
            <div className="mt-2 text-muted text-xs">Alta: {dateFmt.format(m.createdAt)}</div>
          </li>
        ))}
      </ul>
    </>
  )
}
