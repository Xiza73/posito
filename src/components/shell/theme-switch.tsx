'use client'

import { useState } from 'react'
import { THEME_COOKIE, type Theme } from '@/lib/theme'

const OPTIONS: { value: Theme; label: string }[] = [
  { value: 'cielo', label: 'Cielo' },
  { value: 'cafe', label: 'Café' },
]

export function ThemeSwitch({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial)

  function select(next: Theme) {
    setTheme(next)
    document.documentElement.dataset.theme = next
    // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API aún no es universal (Safari/Firefox)
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
  }

  return (
    <fieldset
      aria-label="Tema de color"
      className="flex min-w-0 gap-0.5 rounded-full bg-surface-2 p-0.75 text-[13px]"
    >
      {OPTIONS.map((o) => {
        const on = theme === o.value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => select(o.value)}
            className={`cursor-pointer rounded-full px-3 py-1.5 ${
              on ? 'bg-accent text-accent-ink' : 'text-ink'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </fieldset>
  )
}
