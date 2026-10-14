'use client'

import { useEffect } from 'react'
import { formatCents } from '@/lib/format'
import type { PaymentMethod } from '../lib/payment'
import { PaymentMethods } from './payment-methods'
import { type CartLineView, TicketLines } from './ticket-lines'

type Props = {
  lines: CartLineView[]
  count: number
  totalCents: number
  open: boolean
  pay: PaymentMethod
  error: string | null
  pending: boolean
  onOpen: () => void
  onClose: () => void
  onPay: (method: PaymentMethod) => void
  onChangeQty: (key: string, delta: 1 | -1) => void
  onCharge: () => void
}

/** Móvil < 768: barra flotante "Ver ticket" + hoja deslizable inferior. */
export function MobileCart({
  lines,
  count,
  totalCents,
  open,
  pay,
  error,
  pending,
  onOpen,
  onClose,
  onPay,
  onChangeQty,
  onCharge,
}: Props) {
  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (lines.length === 0) return null

  const total = formatCents(totalCents)

  return (
    <div className="md:hidden">
      {!open && (
        <div className="fixed inset-x-3 bottom-21 z-10">
          <button
            type="button"
            onClick={onOpen}
            className="flex h-13.5 w-full cursor-pointer items-center justify-between rounded-card bg-accent px-4.5 font-semibold text-[15px] text-accent-ink shadow-pop"
          >
            <span>
              Ver ticket · {count} {count === 1 ? 'artículo' : 'artículos'}
            </span>
            <span className="font-mono">{total}</span>
          </button>
        </div>
      )}

      {open && (
        <>
          <button
            type="button"
            aria-label="Cerrar ticket"
            onClick={onClose}
            className="fixed inset-0 z-30 cursor-default bg-black/40"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Ticket actual"
            className="fixed inset-x-0 bottom-0 z-40 flex max-h-[85%] animate-sheet-up flex-col rounded-t-card bg-surface"
          >
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-sm bg-line" aria-hidden="true" />
            <div className="flex items-center justify-between px-5 pt-3.5 pb-2">
              <h2 className="font-semibold">Ticket actual</h2>
            </div>
            <div className="flex-1 overflow-auto px-5">
              <TicketLines lines={lines} onChangeQty={onChangeQty} large />
            </div>
            <div className="flex flex-col gap-3 border-line border-t px-5 pt-3.5 pb-6">
              <PaymentMethods value={pay} onChange={onPay} />
              {error ? (
                <p role="alert" className="text-bad text-sm">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                onClick={onCharge}
                disabled={pending}
                className="h-13 cursor-pointer rounded-ctl bg-accent font-semibold text-[15px] text-accent-ink disabled:cursor-wait disabled:opacity-60"
              >
                {pending ? 'Cobrando…' : `Cobrar ${total}`}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
