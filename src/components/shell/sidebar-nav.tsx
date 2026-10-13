'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/ui/icon'
import { isActive, NAV_ITEMS, visibleItems } from './nav-items'

export function SidebarNav({ canManage }: { canManage: boolean }) {
  const pathname = usePathname()

  return (
    <ul className="flex flex-col gap-1">
      {visibleItems(NAV_ITEMS, canManage).map((it) => {
        const active = isActive(pathname, it.href)
        return (
          <li key={it.href}>
            <Link
              href={it.href}
              title={it.label}
              aria-label={it.label}
              aria-current={active ? 'page' : undefined}
              className={`flex h-11 items-center gap-3 rounded-ctl px-2.5 font-medium text-sm transition-colors ${
                active ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-surface-2'
              }`}
            >
              <span className="grid size-5 flex-none place-items-center">
                <Icon d={it.icon} />
              </span>
              <span className="hidden lg:inline">{it.label}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
