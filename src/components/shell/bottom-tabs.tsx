'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icon } from '@/components/ui/icon'
import { isActive, MORE_ITEMS, TAB_ITEMS } from './nav-items'
import { PendingBadge } from './pending-badge'

const moreHrefs = MORE_ITEMS.map((m) => m.href)

/** Móvil < 768: barra inferior Caja, Ventas, Productos, Más. */
export function BottomTabs() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-20 flex h-17 border-line border-t bg-surface md:hidden"
    >
      {TAB_ITEMS.map((t) => {
        const active = isActive(pathname, t.href, moreHrefs)
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-1.5 font-medium text-[11px] ${
              active ? 'text-accent' : 'text-muted'
            }`}
          >
            <span className="relative">
              <Icon d={t.icon} size={20} />
              {t.pending ? <PendingBadge /> : null}
            </span>
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
