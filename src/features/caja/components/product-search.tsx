'use client'

import { useEffect, useRef } from 'react'
import { Icon } from '@/components/ui/icon'

type Props = {
  value: string
  onChange: (value: string) => void
}

/** Búsqueda + botón Escanear. F2 enfoca el campo. */
export function ProductSearch({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="flex gap-2.5">
      <label className="field-box flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-ctl border border-line bg-surface px-3.5">
        <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5" />
        <span className="sr-only">Buscar producto o escanear código</span>
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar o escanear código"
          className="w-0 min-w-0 flex-1 bg-transparent text-[15px]"
        />
        <kbd className="hidden rounded-sm border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted md:inline">
          F2
        </kbd>
      </label>
      <button
        type="button"
        className="hidden h-12 cursor-pointer items-center whitespace-nowrap rounded-ctl border border-line bg-surface px-4 text-sm hover:border-accent md:flex"
      >
        Escanear
      </button>
    </div>
  )
}
