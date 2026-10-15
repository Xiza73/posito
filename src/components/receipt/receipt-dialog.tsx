'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { shareReceiptImage } from '@/lib/receipt-image'
import { type ReceiptLine, receiptLines, receiptTitle, type SaleSummary } from '@/lib/receipt-lines'

type Props = {
  /** null = cerrado. */
  sale: SaleSummary | null
  businessName: string
  onClose: () => void
  /** Texto del botón principal (en caja: "Nueva venta"). */
  closeLabel?: string
}

/**
 * Boleta de una venta (recién cobrada o consultada en Ventas; si está anulada lo dice), en un `<dialog>` nativo. Se monta en `document.body` para que
 * el CSS de impresión (globals.css) pueda ocultar el resto de la página sin ocultar la boleta.
 * Solo se renderiza tras una interacción en el cliente, así que `document` siempre existe.
 */
export function ReceiptDialog({ sale, businessName, onClose, closeLabel = 'Cerrar' }: Props) {
  if (!sale) return null
  return createPortal(
    <Receipt sale={sale} businessName={businessName} onClose={onClose} closeLabel={closeLabel} />,
    document.body,
  )
}

function Receipt({
  sale,
  businessName,
  onClose,
  closeLabel,
}: {
  sale: SaleSummary
  businessName: string
  onClose: () => void
  closeLabel: string
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const newSaleRef = useRef<HTMLButtonElement>(null)
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const el = dialogRef.current
    if (el && !el.open) el.showModal()
    newSaleRef.current?.focus()
  }, [])

  async function share() {
    setError(null)
    setSharing(true)
    try {
      await shareReceiptImage(sale, businessName)
    } catch (e) {
      console.error('[boleta] compartir boleta falló', e)
      setError('No se pudo generar la imagen. Usa Imprimir / PDF.')
    } finally {
      setSharing(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      data-receipt
      aria-label={receiptTitle(sale)}
      onClose={onClose}
      className="m-auto max-h-[92vh] w-[min(94vw,22rem)] overflow-auto rounded-card border border-line bg-surface p-4 text-ink shadow-pop backdrop:bg-black/40"
    >
      {/* El papel es siempre blanco con texto negro, en cualquier tema */}
      <div className="receipt-paper rounded-ctl bg-white px-5 py-6 font-mono text-[#111] text-xs leading-relaxed">
        {receiptLines(sale, businessName).map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lista estática, nunca se reordena
          <ReceiptRow key={i} line={line} />
        ))}
      </div>

      {error ? (
        <p role="alert" className="no-print mt-3 text-bad text-sm">
          {error}
        </p>
      ) : null}

      <div className="no-print mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={share}
          disabled={sharing}
          className="h-11 cursor-pointer rounded-ctl border border-line font-medium text-sm hover:bg-surface-2 disabled:cursor-wait disabled:opacity-60"
        >
          {sharing ? 'Generando…' : 'Compartir imagen'}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="h-11 cursor-pointer rounded-ctl border border-line font-medium text-sm hover:bg-surface-2"
        >
          Imprimir / PDF
        </button>
        <button
          ref={newSaleRef}
          type="button"
          onClick={onClose}
          className="col-span-2 h-12 cursor-pointer rounded-ctl bg-accent font-semibold text-accent-ink text-sm"
        >
          {closeLabel}
        </button>
      </div>
    </dialog>
  )
}

function ReceiptRow({ line }: { line: ReceiptLine }) {
  const size = 'large' in line && line.large ? 'text-[15px]' : ''
  const weight = 'bold' in line && line.bold ? 'font-medium' : ''

  switch (line.kind) {
    case 'center':
      return <div className={`text-center ${size} ${weight}`}>{line.text}</div>
    case 'row':
      return (
        <div className={`flex justify-between gap-3 ${size} ${weight}`}>
          <span className="min-w-0 break-words">{line.left}</span>
          <span className="whitespace-nowrap">{line.right}</span>
        </div>
      )
    case 'rule':
      return <div className="my-2.5 border-[#999] border-t border-dashed" />
    case 'gap':
      return <div className="h-3" />
  }
}
