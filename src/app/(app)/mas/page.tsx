import Link from 'next/link'
import { MORE_ITEMS } from '@/components/shell/nav-items'
import { Icon } from '@/components/ui/icon'

export default function MasPage() {
  return (
    <div className="animate-fade-up p-4">
      <ul className="overflow-hidden rounded-card border border-line bg-surface">
        {MORE_ITEMS.map((it) => (
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
    </div>
  )
}
