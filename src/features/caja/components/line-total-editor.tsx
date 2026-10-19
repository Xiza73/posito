'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { formatCents } from '@/lib/format'
import { centsToPriceInput, parsePriceToCents } from '@/lib/price-input'

/** Un cambio mayor a este porcentaje del precio automático pide confirmación. */
const CONFIRM_PERCENT = 50

type Props = {
  name: string
  /** Importe automático de la línea (precio normal o por mayor × cantidad). */
  autoCents: number
  /** Importe editado a mano, o null si la línea usa el precio automático. */
  manualCents: number | null
  /** Botones más grandes (hoja móvil). */
  large?: boolean
  disabled?: boolean
  /** null = volver al precio automático. */
  onChange: (cents: number | null) => void
}

type Mode = { kind: 'view' } | { kind: 'edit' } | { kind: 'confirm'; cents: number }

/**
 * Importe de una línea del ticket, editable cuando la bodega permite precios manuales. Tocar el
 * importe abre un campo: Enter o salir del campo aplica, Esc cancela. Un cambio de más de 50 %
 * respecto al precio automático pide una confirmación. Solo es una ayuda de pantalla: el servidor
 * valida el ajuste y recalcula todo al cobrar.
 */
export function LineTotalEditor({
  name,
  autoCents,
  manualCents,
  large = false,
  disabled = false,
  onChange,
}: Props) {
  const [mode, setMode] = useState<Mode>({ kind: 'view' })
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  // Evita aplicar dos veces (Enter y luego el blur que provoca desmontar el campo)
  const doneRef = useRef(false)
  const errorId = useId()
  const shown = manualCents ?? autoCents

  useEffect(() => {
    if (mode.kind === 'edit') inputRef.current?.select()
    if (mode.kind === 'confirm') confirmRef.current?.focus()
  }, [mode.kind])

  function open() {
    if (disabled) return
    doneRef.current = false
    setText(centsToPriceInput(shown))
    setError(null)
    setMode({ kind: 'edit' })
  }

  function cancel() {
    doneRef.current = true
    setError(null)
    setMode({ kind: 'view' })
  }

  function apply(fromBlur: boolean) {
    if (doneRef.current) return
    const cents = parsePriceToCents(text)
    if (cents === null || cents < 1) {
      if (fromBlur) cancel()
      else setError('Ingresa un precio válido, desde S/ 0.01 (ej. 3.50)')
      return
    }
    if (cents === shown) return cancel()
    if (cents === autoCents) {
      doneRef.current = true
      onChange(null)
      setMode({ kind: 'view' })
      return
    }
    if (Math.abs(cents - autoCents) * 100 > autoCents * CONFIRM_PERCENT) {
      doneRef.current = true
      setError(null)
      setMode({ kind: 'confirm', cents })
      return
    }
    doneRef.current = true
    onChange(cents)
    setMode({ kind: 'view' })
  }

  const size = large ? 'h-9' : 'h-8'

  return (
    <>
      {mode.kind === 'edit' ? (
        <span className="flex w-24 flex-none flex-col items-end">
          <input
            ref={inputRef}
            type="text"
            inputMode="decimal"
            aria-label={`Precio total de ${name}`}
            aria-invalid={error !== null}
            aria-describedby={error ? errorId : undefined}
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                apply(false)
              } else if (e.key === 'Escape') {
                // No cerrar la hoja del ticket (móvil) al cancelar la edición
                e.stopPropagation()
                cancel()
              }
            }}
            onBlur={() => apply(true)}
            className={`${size} w-full rounded-ctl border border-accent bg-surface px-2 text-right font-mono text-sm`}
          />
        </span>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={open}
          aria-label={`Editar el precio total de ${name}, ${formatCents(shown)}`}
          className={`${size} min-w-16 cursor-pointer rounded-ctl px-1.5 text-right font-mono text-sm underline decoration-dotted underline-offset-4 hover:bg-surface-2 disabled:cursor-not-allowed disabled:no-underline ${
            manualCents !== null ? 'text-accent' : ''
          }`}
        >
          {formatCents(shown)}
        </button>
      )}

      {mode.kind === 'edit' && error ? (
        <p id={errorId} role="alert" className="basis-full text-bad text-xs">
          {error}
        </p>
      ) : null}

      {mode.kind === 'confirm' ? (
        <div
          role="alert"
          className="flex basis-full flex-wrap items-center justify-end gap-2 text-xs"
        >
          <span>¿Seguro? El precio cambia más de {CONFIRM_PERCENT} %</span>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => {
              onChange(mode.cents)
              setMode({ kind: 'view' })
            }}
            className="h-8 cursor-pointer rounded-ctl bg-accent px-3 font-semibold text-accent-ink"
          >
            Sí, cambiar a {formatCents(mode.cents)}
          </button>
          <button
            type="button"
            onClick={cancel}
            className="h-8 cursor-pointer rounded-ctl border border-line px-3 hover:bg-surface-2"
          >
            Cancelar
          </button>
        </div>
      ) : null}
    </>
  )
}
