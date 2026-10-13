'use client'

import { useState } from 'react'
import { THEME_COOKIE, type Theme } from '@/lib/theme'

// Cada ícono nombra el tema y el momento del día: sol tras nube (cielo, día),
// taza con luna como vapor (café, noche).
const OPTIONS: { value: Theme; label: string; paths: string[] }[] = [
  {
    value: 'cielo',
    label: 'Cielo (claro)',
    paths: [
      'M9 2.5v1.5M3.9 4.6l1.1 1.1M2 9.5h1.5M14.1 4.6 13 5.7',
      'M5.6 11.6a3.5 3.5 0 1 1 6.6-2.1',
      'M17.5 20H9.5a3.5 3.5 0 1 1 .7-6.93A4.5 4.5 0 0 1 18.9 14a3 3 0 0 1-1.4 6z',
    ],
  },
  {
    value: 'cafe',
    label: 'Café (oscuro)',
    paths: [
      'M4 12h11v3.5a4.5 4.5 0 0 1-4.5 4.5h-2A4.5 4.5 0 0 1 4 15.5z',
      'M15 13h1.5a2.5 2.5 0 0 1 0 5H15',
      'M11 3.2a3.2 3.2 0 1 0 3.3 4.6 2.6 2.6 0 0 1-3.3-4.6z',
    ],
  },
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
            aria-label={`Tema ${o.label}`}
            title={o.label}
            onClick={() => select(o.value)}
            className={`grid size-8 cursor-pointer place-items-center rounded-full transition-colors ${
              on ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink'
            }`}
          >
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {o.paths.map((d) => (
                <path key={d} d={d} />
              ))}
            </svg>
          </button>
        )
      })}
    </fieldset>
  )
}
