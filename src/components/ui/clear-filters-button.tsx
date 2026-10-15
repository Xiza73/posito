'use client'

import { useSearchParams } from 'next/navigation'

// La paginación no es un filtro: sola no justifica el botón
const IGNORED = new Set(['pagina'])

/**
 * "Limpiar filtros" estándar: solo aparece si la URL tiene algún filtro. `onClear` navega a la
 * ruta sin parámetros dentro de la transición de la vista (lista inert mientras carga).
 */
export function ClearFiltersButton({ onClear }: { onClear: () => void }) {
  const searchParams = useSearchParams()
  const active = [...searchParams.keys()].some((k) => !IGNORED.has(k))
  if (!active) return null

  return (
    <button
      type="button"
      onClick={onClear}
      className="h-11 cursor-pointer rounded-ctl px-3 text-muted text-sm underline-offset-4 hover:text-ink hover:underline"
    >
      Limpiar filtros
    </button>
  )
}
