'use client'

import { usePathname } from 'next/navigation'
import { createContext, useContext, useEffect, useState } from 'react'

/** Evento que lanzan las acciones de aprobar/rechazar para refrescar el contador al instante. */
export const PENDING_CHANGED_EVENT = 'ventas:pending-changed'
const POLL_MS = 30_000

export function notifyPendingChanged() {
  window.dispatchEvent(new Event(PENDING_CHANGED_EVENT))
}

export function pendingLabel(count: number) {
  return `${count} ${count === 1 ? 'venta por validar' : 'ventas por validar'}`
}

const PendingContext = createContext(0)

/** Cantidad de ventas por validar (0 si el usuario no puede aprobar). */
export const usePendingCount = () => useContext(PendingContext)

/**
 * Mantiene UN solo contador para toda la barra (sidebar + pestañas móviles) con una consulta:
 * al montar, al cambiar de ruta, cada 30 s (si la pestaña está visible), al volver a la pestaña y
 * cuando una acción lanza `ventas:pending-changed`.
 *
 * Sin tiempo real a propósito (fuera de alcance): aquí es donde enchufaría un canal SSE/WebSocket
 * o una notificación push en lugar del sondeo.
 */
export function PendingSalesProvider({
  enabled,
  children,
}: {
  /** Solo quien puede aprobar consulta el contador. */
  enabled: boolean
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [count, setCount] = useState(0)

  // `pathname` en las dependencias: cada navegación vuelve a consultar
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname dispara la consulta a propósito
  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function refresh() {
      if (document.hidden) return
      try {
        const res = await fetch('/ventas/pendientes', { cache: 'no-store' })
        // Sin sesión el middleware redirige a /login (HTML): se ignora, no es un conteo
        if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return
        const data: unknown = await res.json()
        if (
          !cancelled &&
          typeof data === 'object' &&
          data !== null &&
          'count' in data &&
          typeof data.count === 'number'
        ) {
          setCount(data.count)
        }
      } catch {
        // Sin red: se conserva el último conteo y se reintenta en el próximo ciclo
      }
    }

    refresh()
    const timer = setInterval(refresh, POLL_MS)
    window.addEventListener(PENDING_CHANGED_EVENT, refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener(PENDING_CHANGED_EVENT, refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [enabled, pathname])

  return <PendingContext value={enabled ? count : 0}>{children}</PendingContext>
}

/** Globo con el número, anclado a la esquina de su contenedor (`relative`). Nada si no hay. */
export function PendingBadge() {
  const count = usePendingCount()
  if (count <= 0) return null
  return (
    <>
      <span
        aria-hidden="true"
        className="absolute -top-1.5 -right-2 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 font-semibold text-[10px] text-white leading-none"
      >
        {count > 99 ? '99+' : count}
      </span>
      <span className="sr-only">{pendingLabel(count)}</span>
    </>
  )
}
