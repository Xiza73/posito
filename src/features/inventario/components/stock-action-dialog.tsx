'use client'

import { useActionState, useState } from 'react'
import { Field, INPUT } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { adjustAction, countAction, type InventoryFormState, ingresoAction } from '../actions'
import type { StockRow } from '../data/inventory'
import { ADJUST_REASON_CODES, ADJUST_REASONS, NOTE_MAX, OTHER_MAX, OTHER_MIN } from '../lib/schemas'
import { CancelButton, DoneNotice, StockDialog } from './stock-dialog'

export type StockTarget = { kind: 'ingreso' | 'ajuste' | 'conteo'; product: StockRow }

const INITIAL: InventoryFormState = { ok: false }

const TITLES = {
  ingreso: 'Ingresar mercadería',
  ajuste: 'Ajustar stock',
  conteo: 'Contar stock',
} as const

/** Diálogo de una acción de stock sobre UN producto (ingresar, ajustar o contar). */
export function StockActionDialog({
  target,
  onClose,
}: {
  target: StockTarget | null
  onClose: () => void
}) {
  return (
    <StockDialog open={target !== null} onClose={onClose} titleId="stock-dialog-title">
      {target ? (
        <ActionForm key={`${target.kind}:${target.product.id}`} target={target} onClose={onClose} />
      ) : null}
    </StockDialog>
  )
}

function ActionForm({ target, onClose }: { target: StockTarget; onClose: () => void }) {
  const { kind, product } = target
  const action = { ingreso: ingresoAction, ajuste: adjustAction, conteo: countAction }[kind]
  const [state, formAction] = useActionState(action, INITIAL)
  const fe = state.fieldErrors ?? {}

  return (
    <>
      <h2 id="stock-dialog-title" className="mb-1 font-semibold text-lg">
        {TITLES[kind]}
      </h2>
      <p className="mb-4 text-muted text-sm">
        {product.name} · Stock actual <span className="font-mono">{product.stock} u.</span>
      </p>

      {state.ok && state.message ? (
        <DoneNotice message={state.message} onClose={onClose} />
      ) : (
        <form action={formAction} className="flex flex-col gap-3.5">
          <input type="hidden" name="productId" value={product.id} />

          {kind === 'ingreso' ? (
            <>
              <Field id="sa-quantity" label="Cantidad que ingresa" error={fe.quantity?.[0]}>
                <input
                  id="sa-quantity"
                  name="quantity"
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  className={INPUT}
                />
              </Field>
              <NoteField error={fe.note?.[0]} hint="Opcional. Ej. Proveedor Backus, factura 123" />
            </>
          ) : null}

          {kind === 'conteo' ? (
            <>
              <Field
                id="sa-counted"
                label="Cantidad contada"
                error={fe.counted?.[0]}
                hint="Lo que hay físicamente. La diferencia se calcula con el stock al guardar."
              >
                <input
                  id="sa-counted"
                  name="counted"
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  className={INPUT}
                />
              </Field>
              <NoteField error={fe.note?.[0]} hint="Opcional" />
            </>
          ) : null}

          {kind === 'ajuste' ? <AdjustFields fe={fe} /> : null}

          {state.error && Object.keys(fe).length === 0 ? (
            <p role="alert" className="text-bad text-sm">
              {state.error}
            </p>
          ) : null}

          <div className="mt-1 flex justify-end gap-2">
            <CancelButton onClose={onClose} />
            <SubmitButton
              pendingLabel="Guardando…"
              className="h-10 rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm"
            >
              Guardar
            </SubmitButton>
          </div>
        </form>
      )}
    </>
  )
}

function NoteField({ error, hint }: { error?: string; hint: string }) {
  return (
    <Field id="sa-note" label="Nota" error={error} hint={hint}>
      <input id="sa-note" name="note" maxLength={NOTE_MAX} autoComplete="off" className={INPUT} />
    </Field>
  )
}

function AdjustFields({ fe }: { fe: NonNullable<InventoryFormState['fieldErrors']> }) {
  const [code, setCode] = useState<string>('')

  return (
    <>
      <fieldset className="flex gap-4 text-sm">
        <legend className="mb-1.5 font-medium">Tipo de ajuste</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="direction"
            value="restar"
            defaultChecked
            className="size-4 accent-[var(--accent)]"
          />
          Restar
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="direction"
            value="sumar"
            className="size-4 accent-[var(--accent)]"
          />
          Sumar
        </label>
      </fieldset>

      <Field id="sa-quantity" label="Cantidad" error={fe.quantity?.[0]}>
        <input
          id="sa-quantity"
          name="quantity"
          required
          inputMode="numeric"
          autoComplete="off"
          className={INPUT}
        />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium text-sm">Motivo</legend>
        {ADJUST_REASON_CODES.map((c) => (
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
            {ADJUST_REASONS[c]}
          </label>
        ))}
        {fe.reasonCode?.[0] ? (
          <span role="alert" className="text-bad text-xs">
            {fe.reasonCode[0]}
          </span>
        ) : null}
      </fieldset>

      {code === 'otro' ? (
        <div className="flex flex-col gap-1.5 text-muted text-sm">
          <label htmlFor="sa-other">Describe el motivo</label>
          <textarea
            id="sa-other"
            name="otherText"
            required
            rows={3}
            minLength={OTHER_MIN}
            maxLength={OTHER_MAX}
            aria-invalid={fe.otherText?.[0] ? true : undefined}
            className="w-full rounded-ctl border border-line bg-page px-3 py-2 text-ink"
          />
          <span className="text-xs">
            Entre {OTHER_MIN} y {OTHER_MAX} caracteres
          </span>
        </div>
      ) : null}
    </>
  )
}
