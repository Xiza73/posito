'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { notifyPendingChanged } from '@/components/shell/pending-badge'
import { SubmitButton } from '@/components/ui/submit-button'
import { formatReceiptNumber } from '@/lib/receipt'
import { type VoidFormState, voidSaleAction } from '../actions'
import { OTHER_MAX, OTHER_MIN, VOID_REASON_CODES, VOID_REASONS } from '../lib/schemas'

const INITIAL: VoidFormState = { ok: false }

type Props = {
  open: boolean
  onClose: () => void
  sale: { id: string; series: string; number: number }
  /** 'reject' = rechazar una venta pendiente de validación (misma anulación, otros textos). */
  mode?: 'void' | 'reject'
}

const COPY = {
  void: {
    title: 'Anular venta',
    body: 'Los productos de esta venta volverán al inventario y la venta dejará de contar en los totales. Esta acción no se puede deshacer.',
    legend: 'Motivo de la anulación',
    pending: 'Anulando…',
  },
  reject: {
    title: 'Rechazar venta',
    body: 'Los productos de esta venta volverán al inventario y quedará anulada. Esta acción no se puede deshacer.',
    legend: 'Motivo del rechazo',
    pending: 'Rechazando…',
  },
} as const

/** Diálogo nativo para anular (o rechazar) una venta: motivo obligatorio y aviso de que el stock vuelve. */
export function VoidSaleDialog({ open, onClose, sale, mode = 'void' }: Props) {
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
      aria-labelledby="void-dialog-title"
      className="m-auto max-h-[92vh] w-[min(94vw,28rem)] overflow-auto rounded-card border border-line bg-surface p-6 text-ink shadow-pop backdrop:bg-black/40"
    >
      {/* Se monta solo abierto: cada apertura empieza con un formulario limpio */}
      {open ? <VoidForm sale={sale} onClose={onClose} mode={mode} /> : null}
    </dialog>
  )
}

function VoidForm({
  sale,
  onClose,
  mode,
}: {
  sale: Props['sale']
  onClose: () => void
  mode: NonNullable<Props['mode']>
}) {
  const copy = COPY[mode]
  const [code, setCode] = useState<string>('')

  async function submit(prev: VoidFormState, formData: FormData) {
    const result = await voidSaleAction(prev, formData)
    if (result.ok) {
      notifyPendingChanged()
      onClose()
    }
    return result
  }
  const [state, action] = useActionState(submit, INITIAL)
  const otherError = state.fieldErrors?.otherText?.[0]

  return (
    <>
      <h2 id="void-dialog-title" className="mb-2 font-semibold text-lg">
        {copy.title} {formatReceiptNumber(sale.series, sale.number)}
      </h2>
      <p className="mb-4 text-muted text-sm">{copy.body}</p>

      <form action={action} className="flex flex-col gap-3.5">
        <input type="hidden" name="id" value={sale.id} />
        {/* Rechazar exige que siga pendiente; anular, que siga completada */}
        <input
          type="hidden"
          name="expectedStatus"
          value={mode === 'reject' ? 'pendiente' : 'completada'}
        />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-medium text-sm">{copy.legend}</legend>
          {VOID_REASON_CODES.map((c) => (
            <label key={c} className="flex items-center gap-2.5 text-sm">
              <input
                type="radio"
                name="reasonCode"
                value={c}
                required
                checked={code === c}
                onChange={() => setCode(c)}
                className="size-4 accent-[var(--accent)]"
              />
              {VOID_REASONS[c]}
            </label>
          ))}
        </fieldset>

        {code === 'otro' ? (
          <div className="flex flex-col gap-1.5 text-muted text-sm">
            <label htmlFor="void-other">Describe el motivo</label>
            <textarea
              id="void-other"
              name="otherText"
              required
              rows={3}
              minLength={OTHER_MIN}
              maxLength={OTHER_MAX}
              aria-invalid={otherError ? true : undefined}
              className="w-full rounded-ctl border border-line bg-page px-3 py-2 text-ink"
            />
            <span className="text-xs">
              Entre {OTHER_MIN} y {OTHER_MAX} caracteres
            </span>
          </div>
        ) : null}

        {state.error ? (
          <p role="alert" className="text-bad text-sm">
            {state.error}
          </p>
        ) : null}

        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 cursor-pointer rounded-ctl border border-line px-4 font-medium text-sm hover:bg-surface-2"
          >
            Cancelar
          </button>
          <SubmitButton
            pendingLabel={copy.pending}
            className="h-10 rounded-ctl bg-bad px-4 font-semibold text-sm text-white"
          >
            {copy.title}
          </SubmitButton>
        </div>
      </form>
    </>
  )
}
