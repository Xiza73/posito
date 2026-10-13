import Link from 'next/link'
import { LogoutButton } from '@/components/shell/logout-button'
import { MORE_ITEMS, visibleItems } from '@/components/shell/nav-items'
import { Icon } from '@/components/ui/icon'
import { can, roleLabel } from '@/lib/permissions'
import { getCurrentMember } from '@/lib/session'

export default async function MasPage() {
  const { user, member, organization } = await getCurrentMember()
  const items = visibleItems(MORE_ITEMS, can(member.role, { member: ['create'] }))

  return (
    <div className="flex animate-fade-up flex-col gap-4 p-4">
      <div className="rounded-card border border-line bg-surface p-4.5">
        <div className="font-medium text-[15px]">{user.name}</div>
        <div className="text-muted text-sm">
          {roleLabel(member.role)} · {organization.name}
        </div>
      </div>

      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {items.map((it) => (
          <li key={it.href} className="border-line border-t first:border-t-0">
            <Link href={it.href} className="flex h-14 items-center gap-3.5 px-4.5 text-[15px]">
              <Icon d={it.icon} />
              <span className="flex-1">{it.label}</span>
              <span className="text-muted" aria-hidden="true">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <LogoutButton className="flex h-14 w-full cursor-pointer items-center gap-3.5 rounded-card border border-line bg-surface px-4.5 text-[15px] text-bad" />
    </div>
  )
}
