'use client'

import { usePathname, useRouter } from 'next/navigation'
import { type ReactNode, useTransition } from 'react'
import { PERIOD_LABELS, PERIODS, type Period } from '../lib/period'

/**
 * Selector de período (en la URL: `?periodo=`) + contenido. Único componente cliente de Inicio: el
 * contenido (Server Components) llega como `children` y se inhabilita mientras llega el nuevo.
 */
export function DashboardFrame({ period, children }: { period: Period; children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function select(next: Period) {
    if (next === period) return
    // "hoy" es el valor por defecto: URL limpia
    const url = next === 'hoy' ? pathname : `${pathname}?periodo=${next}`
    startTransition(() => router.replace(url, { scroll: false }))
  }

  return (
    <>
      <fieldset className="flex w-fit min-w-0 gap-0.5 rounded-full border border-line bg-surface p-0.5 text-sm">
        <legend className="sr-only">Período</legend>
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={p === period}
            onClick={() => select(p)}
            className={`h-9 cursor-pointer rounded-full px-3.5 ${
              p === period ? 'bg-accent font-medium text-accent-ink' : 'text-ink hover:bg-surface-2'
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </fieldset>

      <div
        aria-busy={isPending}
        inert={isPending}
        className={`flex flex-col gap-4 transition-opacity ${isPending ? 'opacity-50' : ''}`}
      >
        {isPending ? (
          <p role="status" className="text-muted text-sm">
            Cargando…
          </p>
        ) : null}
        {children}
      </div>
    </>
  )
}
