'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Field, INPUT } from '@/components/ui/field'
import { Icon } from '@/components/ui/icon'
import { SubmitButton } from '@/components/ui/submit-button'
import { batchIngresoAction, type InventoryFormState } from '../actions'
import { MAX_BATCH_LINES, NOTE_MAX } from '../lib/schemas'
import { CancelButton, DoneNotice, StockDialog } from './stock-dialog'

export type AdjustableProduct = { id: string; name: string; barcode: string | null; stock: number }

type Line = { productId: string; name: string; quantity: string }

const INITIAL: InventoryFormState = { ok: false }
const MAX_RESULTS = 8

/** Sin tildes ni mayúsculas, para buscar "cafe" y encontrar "Café". */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const isValidQuantity = (q: string) => /^\d{1,9}$/.test(q.trim()) && Number(q) > 0

/** Ingreso de varios productos en UNA operación (se guarda todo o nada). */
export function BatchIngresoDialog({
  open,
  onClose,
  products,
}: {
  open: boolean
  onClose: () => void
  products: AdjustableProduct[]
}) {
  return (
    <StockDialog open={open} onClose={onClose} titleId="batch-dialog-title" wide>
      {open ? <BatchForm products={products} onClose={onClose} /> : null}
    </StockDialog>
  )
}

function BatchForm({ products, onClose }: { products: AdjustableProduct[]; onClose: () => void }) {
  const [state, formAction] = useActionState(batchIngresoAction, INITIAL)
  const [lines, setLines] = useState<Line[]>([])
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<AdjustableProduct | null>(null)
  const [pickedQty, setPickedQty] = useState('')
  const qtyRef = useRef<HTMLInputElement>(null)

  // Tras elegir el producto, el siguiente paso es la cantidad
  useEffect(() => {
    if (picked) qtyRef.current?.focus()
  }, [picked])

  const q = fold(search.trim())
  const results =
    q === ''
      ? []
      : products
          .filter((p) => fold(p.name).includes(q) || (p.barcode ?? '').toLowerCase().includes(q))
          .slice(0, MAX_RESULTS)

  const allValid = lines.length > 0 && lines.every((l) => isValidQuantity(l.quantity))
  const full = lines.length >= MAX_BATCH_LINES

  /** Un producto repetido no crea otra línea: se suma a la existente. */
  function addPicked() {
    if (!picked || !isValidQuantity(pickedQty)) return
    const qty = Number(pickedQty)
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === picked.id)
      if (existing) {
        return prev.map((l) =>
          l.productId === picked.id ? { ...l, quantity: String(Number(l.quantity || 0) + qty) } : l,
        )
      }
      return [...prev, { productId: picked.id, name: picked.name, quantity: String(qty) }]
    })
    setPicked(null)
    setPickedQty('')
    setSearch('')
  }

  if (state.ok && state.message) {
    return (
      <>
        <h2 id="batch-dialog-title" className="mb-4 font-semibold text-lg">
          Ingreso en lote
        </h2>
        <DoneNotice message={state.message} onClose={onClose} />
      </>
    )
  }

  return (
    <>
      <h2 id="batch-dialog-title" className="mb-1 font-semibold text-lg">
        Ingreso en lote
      </h2>
      <p className="mb-4 text-muted text-sm">
        Registra varios productos en un solo ingreso. Se guarda todo junto o no se guarda nada.
      </p>

      <div className="mb-4 flex flex-col gap-2">
        <label className="field-box flex h-11 items-center gap-2.5 rounded-ctl border border-line bg-page px-3.5">
          <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-3.5-3.5" />
          <span className="sr-only">Buscar producto por nombre o código</span>
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.currentTarget.value)
              setPicked(null)
            }}
            disabled={full}
            autoComplete="off"
            placeholder={full ? `Máximo ${MAX_BATCH_LINES} productos` : 'Buscar producto o código'}
            className="w-0 min-w-0 flex-1 bg-transparent text-sm"
          />
        </label>

        {q !== '' && !picked ? (
          results.length > 0 ? (
            <ul className="flex flex-col overflow-hidden rounded-ctl border border-line text-sm">
              {results.map((p) => (
                <li key={p.id} className="border-line border-t first:border-t-0">
                  <button
                    type="button"
                    onClick={() => setPicked(p)}
                    className="flex w-full cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-surface-2"
                  >
                    <span className="min-w-0 truncate">{p.name}</span>
                    <span className="flex-none font-mono text-muted text-xs">{p.stock} u.</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted text-sm">No hay productos que coincidan.</p>
          )
        ) : null}

        {picked ? (
          <div className="flex flex-wrap items-end gap-2.5 rounded-ctl border border-line bg-surface-2 p-3">
            <div className="min-w-0 flex-1 basis-40">
              <div className="truncate font-medium text-sm">{picked.name}</div>
              <div className="text-muted text-xs">Stock actual {picked.stock} u.</div>
            </div>
            <label className="flex flex-col gap-1 text-muted text-xs">
              Cantidad
              <input
                ref={qtyRef}
                inputMode="numeric"
                autoComplete="off"
                value={pickedQty}
                onChange={(e) => setPickedQty(e.currentTarget.value)}
                onKeyDown={(e) => {
                  // Enter agrega la línea; no debe enviar el ingreso completo
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    addPicked()
                  }
                }}
                className="h-10 w-28 rounded-ctl border border-line bg-page px-3 text-ink text-sm"
              />
            </label>
            <button
              type="button"
              onClick={addPicked}
              disabled={!isValidQuantity(pickedQty)}
              className="h-10 cursor-pointer rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Agregar
            </button>
          </div>
        ) : null}
      </div>

      <form action={formAction} className="flex flex-col gap-3.5">
        <input
          type="hidden"
          name="lines"
          value={JSON.stringify(
            lines.map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })),
          )}
        />

        {lines.length === 0 ? (
          <p className="rounded-ctl border border-line border-dashed p-4 text-center text-muted text-sm">
            Aún no agregaste productos.
          </p>
        ) : (
          <div className="overflow-hidden rounded-ctl border border-line">
            <div className="flex items-center justify-between bg-surface-2 px-3.5 py-2 text-muted text-xs">
              <span>
                {lines.length} {lines.length === 1 ? 'producto' : 'productos'}
              </span>
              <span>Cantidad</span>
            </div>
            <ul>
              {lines.map((l) => (
                <li
                  key={l.productId}
                  className="flex items-center gap-2.5 border-line border-t px-3.5 py-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{l.name}</span>
                  <input
                    aria-label={`Cantidad de ${l.name}`}
                    inputMode="numeric"
                    autoComplete="off"
                    value={l.quantity}
                    aria-invalid={isValidQuantity(l.quantity) ? undefined : true}
                    onChange={(e) => {
                      const quantity = e.currentTarget.value
                      setLines((prev) =>
                        prev.map((x) => (x.productId === l.productId ? { ...x, quantity } : x)),
                      )
                    }}
                    className="h-9 w-24 rounded-ctl border border-line bg-page px-2.5 text-right font-mono text-sm"
                  />
                  <button
                    type="button"
                    aria-label={`Quitar ${l.name}`}
                    onClick={() =>
                      setLines((prev) => prev.filter((x) => x.productId !== l.productId))
                    }
                    className="grid size-9 flex-none cursor-pointer place-items-center rounded-ctl text-muted hover:bg-surface-2 hover:text-bad"
                  >
                    <Icon d="M6 6l12 12M18 6L6 18" size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {lines.length > 0 && !allValid ? (
          <p role="note" className="text-bad text-xs">
            Revisa las cantidades: deben ser números enteros mayores que 0.
          </p>
        ) : null}

        <Field
          id="batch-note"
          label="Nota para todo el ingreso"
          error={state.fieldErrors?.note?.[0]}
          hint="Opcional. Ej. Proveedor Backus, factura 123"
        >
          <input
            id="batch-note"
            name="note"
            maxLength={NOTE_MAX}
            autoComplete="off"
            className={INPUT}
          />
        </Field>

        {state.error ? (
          <p role="alert" className="text-bad text-sm">
            {state.error}
          </p>
        ) : null}

        <div className="mt-1 flex justify-end gap-2">
          <CancelButton onClose={onClose} />
          <SubmitButton
            pendingLabel="Guardando…"
            disabled={!allValid}
            className="h-10 rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm"
          >
            Registrar ingreso
          </SubmitButton>
        </div>
      </form>
    </>
  )
}
