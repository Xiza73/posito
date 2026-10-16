'use client'

import { useEffect, useRef } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  titleId: string
  /** Ancho máximo del diálogo (clase de Tailwind sobre `w-[min(94vw,…)]`). */
  wide?: boolean
  children: React.ReactNode
}

/** `<dialog>` nativo modal: se monta el contenido solo abierto para que cada apertura empiece limpia. */
export function StockDialog({ open, onClose, titleId, wide = false, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (open && !el.open) el.showModal()
    if (!open && el.open) el.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      className={`m-auto max-h-[92vh] overflow-auto rounded-card border border-line bg-surface p-6 text-ink shadow-pop backdrop:bg-black/40 ${
        wide ? 'w-[min(94vw,40rem)]' : 'w-[min(94vw,28rem)]'
      }`}
    >
      {open ? children : null}
    </dialog>
  )
}

/** Confirmación tras una acción correcta (también para "El stock ya coincide"). */
export function DoneNotice({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p role="status" className="text-ok text-sm">
        {message}
      </p>
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="h-10 cursor-pointer rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm"
        >
          Listo
        </button>
      </div>
    </div>
  )
}

export function CancelButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="h-10 cursor-pointer rounded-ctl border border-line px-4 font-medium text-sm hover:bg-surface-2"
    >
      Cancelar
    </button>
  )
}
