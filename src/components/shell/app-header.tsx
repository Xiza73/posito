'use client'

import { usePathname } from 'next/navigation'
import type { Theme } from '@/lib/theme'
import { titleFor } from './nav-items'
import { ThemeSwitch } from './theme-switch'

export function AppHeader({ today, theme }: { today: string; theme: Theme }) {
  const pathname = usePathname()

  return (
    <header className="flex flex-none items-center gap-3.5 border-line border-b px-5 py-4.5 md:px-7 md:py-5.5">
      <h1 className="min-w-0 flex-1 font-semibold text-[22px] leading-tight tracking-tight md:text-[26px]">
        {titleFor(pathname)}
      </h1>
      <span className="hidden text-[13px] text-muted md:block">{today}</span>
      <ThemeSwitch initial={theme} />
      <div
        className="grid size-8.5 place-items-center rounded-full bg-accent-soft font-semibold text-accent text-xs md:hidden"
        role="img"
        aria-label="Ana Rojas, Administradora"
      >
        AR
      </div>
    </header>
  )
}
