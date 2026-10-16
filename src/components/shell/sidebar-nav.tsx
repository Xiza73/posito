'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/ui/icon'
import { isActive, NAV_ITEMS, visibleItems } from './nav-items'
import { PendingBadge, pendingLabel, usePendingCount } from './pending-badge'

export function SidebarNav({ canManage }: { canManage: boolean }) {
  const pathname = usePathname()
  const pending = usePendingCount()

  return (
    <ul className="flex flex-col gap-1">
      {visibleItems(NAV_ITEMS, canManage).map((it) => {
        const active = isActive(pathname, it.href)
        // En el rail de tablet no hay texto visible: el nombre accesible incluye el contador
        const label = it.pending && pending > 0 ? `${it.label}, ${pendingLabel(pending)}` : it.label
        return (
          <li key={it.href}>
            <Link
              href={it.href}
              title={label}
              aria-label={label}
              aria-current={active ? 'page' : undefined}
              className={`flex h-11 items-center gap-3 rounded-ctl px-2.5 font-medium text-sm transition-colors ${
                active ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-surface-2'
              }`}
            >
              <span className="relative grid size-5 flex-none place-items-center">
                <Icon d={it.icon} />
                {it.pending ? <PendingBadge /> : null}
              </span>
              <span className="hidden lg:inline">{it.label}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
