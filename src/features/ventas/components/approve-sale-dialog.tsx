'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { notifyPendingChanged } from '@/components/shell/pending-badge'
import { formatReceiptNumber } from '@/lib/receipt'
import { approveSaleAction } from '../actions'

type Props = {
  open: boolean
  onClose: () => void
  sale: { id: string; series: string; number: number }
}

/** Confirmación nativa para aprobar una venta pendiente de validación. */
export function ApproveSaleDialog({ open, onClose, sale }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) {
      setError(null)
      el.showModal()
    }
    if (!open && el.open) el.close()
  }, [open])

  function approve() {
    setError(null)
    startTransition(async () => {
      const res = await approveSaleAction(sale.id)
      if (res.ok) {
        notifyPendingChanged()
        onClose()
      } else {
        setError(res.error)
      }
    })
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="approve-dialog-title"
      className="m-auto max-h-[92vh] w-[min(94vw,26rem)] overflow-auto rounded-card border border-line bg-surface p-6 text-ink shadow-pop backdrop:bg-black/40"
    >
      <h2 id="approve-dialog-title" className="mb-2 font-semibold text-lg">
        Aprobar venta {formatReceiptNumber(sale.series, sale.number)}
      </h2>
      <p className="mb-4 text-muted text-sm">
        La venta quedará como completada y sumará a los totales. El inventario no cambia: ya se
        descontó al cobrar.
      </p>

      {error ? (
        <p role="alert" className="mb-3 text-bad text-sm">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={pending}
          className="h-10 cursor-pointer rounded-ctl border border-line px-4 font-medium text-sm hover:bg-surface-2 disabled:opacity-60"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={approve}
          disabled={pending}
          aria-disabled={pending}
          className="h-10 cursor-pointer rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? 'Aprobando…' : 'Aprobar venta'}
        </button>
      </div>
    </dialog>
  )
}
