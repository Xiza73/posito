'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { Field, INPUT } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import { MAX_TIERS, validateTiers } from '@/lib/pricing'
import { createProductAction, type FormState, updateProductAction } from '../actions'
import type { ProductRow } from '../data/products'
import { centsToPriceInput, parsePriceToCents, parseTierRows, type TierRow } from '../lib/schemas'
import { ProductPhotos } from './product-photos'

const INITIAL: FormState = { ok: false }

type Props = {
  /** 'new' = alta, un producto = edición, null = cerrado. */
  target: ProductRow | 'new' | null
  /** Nombres de categorías existentes, para el combobox. */
  categories: string[]
  /** Base pública de las fotos (publicImageBase); null = Storage sin configurar, sin sección de foto. */
  imageBase: string | null
  onClose: () => void
}

export function ProductFormDialog({ target, categories, imageBase, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (target && !el.open) el.showModal()
    if (!target && el.open) el.close()
  }, [target])

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="product-dialog-title"
      className="m-auto max-h-[92vh] w-[min(94vw,30rem)] overflow-auto rounded-card border border-line bg-surface p-6 text-ink shadow-pop backdrop:bg-black/40"
    >
      {/* Se monta solo abierto: cada apertura empieza con un estado de formulario limpio */}
      {target ? (
        <ProductForm
          key={target === 'new' ? 'new' : target.id}
          product={target === 'new' ? null : target}
          categories={categories}
          imageBase={imageBase}
          onClose={onClose}
        />
      ) : null}
    </dialog>
  )
}

function ProductForm({
  product,
  categories,
  imageBase,
  onClose,
}: {
  product: ProductRow | null
  categories: string[]
  imageBase: string | null
  onClose: () => void
}) {
  const editing = product !== null

  async function submit(prev: FormState, formData: FormData) {
    const result = await (editing ? updateProductAction : createProductAction)(prev, formData)
    if (result.ok) onClose()
    return result
  }

  const [state, action] = useActionState(submit, INITIAL)
  const fe = state.fieldErrors ?? {}
  const v = state.values
  const [priceText, setPriceText] = useState(
    v?.price ?? (product ? centsToPriceInput(product.priceCents) : ''),
  )
  const [tierRows, setTierRows] = useState<TierRow[]>(
    () =>
      v?.tiers ??
      product?.tiers.map((t) => ({
        minQty: String(t.minQty),
        price: centsToPriceInput(t.unitPriceCents),
      })) ??
      [],
  )
  // Aviso en vivo; el servidor vuelve a validar todo (src/lib/pricing.ts)
  const tierErrors = (() => {
    const parsed = parseTierRows(tierRows)
    const base = parsePriceToCents(priceText)
    return [...parsed.errors, ...(base === null ? [] : validateTiers(base, parsed.tiers))]
  })()
  const tierServerError = fe.tiers?.[0]
  const [tracksStock, setTracksStock] = useState(v?.tracksStock ?? product?.tracksStock ?? true)

  return (
    <>
      <h2 id="product-dialog-title" className="mb-4 font-semibold text-lg">
        {editing ? 'Editar producto' : 'Nuevo producto'}
      </h2>
      <form action={action} className="flex flex-col gap-3.5">
        {product ? <input type="hidden" name="id" value={product.id} /> : null}

        {/* La foto se sube contra Storage con el producto ya creado: en el alta solo se avisa */}
        {imageBase ? (
          product ? (
            <ProductPhotos
              productId={product.id}
              productName={product.name}
              imageBase={imageBase}
              initialPath={product.imagePath}
            />
          ) : (
            <p className="text-muted text-xs">
              Podrás agregar la foto después de crear el producto.
            </p>
          )
        ) : null}

        <Field id="pf-name" label="Nombre" error={fe.name?.[0]}>
          <input
            id="pf-name"
            name="name"
            required
            minLength={2}
            maxLength={80}
            autoComplete="off"
            defaultValue={v?.name ?? product?.name}
            className={INPUT}
          />
        </Field>

        <div className="grid gap-3.5 sm:grid-cols-2">
          <Field
            id="pf-price"
            label="Precio (S/, IGV incluido)"
            error={fe.price?.[0]}
            hint="Ej. 3.50"
          >
            <input
              id="pf-price"
              name="price"
              required
              inputMode="decimal"
              autoComplete="off"
              defaultValue={priceText}
              onChange={(e) => setPriceText(e.currentTarget.value)}
              className={INPUT}
            />
          </Field>
          <Field id="pf-barcode" label="Código de barras" error={fe.barcode?.[0]} hint="Opcional">
            <input
              id="pf-barcode"
              name="barcode"
              maxLength={40}
              autoComplete="off"
              defaultValue={v?.barcode ?? product?.barcode ?? ''}
              className={INPUT}
            />
          </Field>
        </div>

        <Field
          id="pf-category"
          label="Categoría"
          error={fe.categoryName?.[0]}
          hint="Elige una existente o escribe un nombre nuevo para crearla"
        >
          <input
            id="pf-category"
            name="categoryName"
            list="pf-category-options"
            maxLength={40}
            autoComplete="off"
            defaultValue={v?.categoryName ?? product?.categoryName ?? ''}
            className={INPUT}
          />
          <datalist id="pf-category-options">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>

        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            name="tracksStock"
            defaultChecked={tracksStock}
            onChange={(e) => setTracksStock(e.currentTarget.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          Controlar stock
        </label>

        {tracksStock ? (
          <div className="grid gap-3.5 sm:grid-cols-2">
            {editing ? (
              <div className="flex flex-col gap-1.5 text-muted text-sm">
                <span>Stock actual</span>
                <output className="flex h-11 items-center rounded-ctl border border-line bg-surface-2 px-3 font-mono text-ink">
                  {product.stock} u.
                </output>
                <span className="text-xs">Se ajusta desde Inventario</span>
              </div>
            ) : (
              <Field id="pf-initial" label="Stock inicial" error={fe.initialStock?.[0]}>
                <input
                  id="pf-initial"
                  name="initialStock"
                  inputMode="numeric"
                  autoComplete="off"
                  defaultValue={v?.initialStock ?? '0'}
                  className={INPUT}
                />
              </Field>
            )}
            <Field
              id="pf-min"
              label="Stock mínimo"
              error={fe.minStock?.[0]}
              hint="Avisa cuando baje de aquí"
            >
              <input
                id="pf-min"
                name="minStock"
                inputMode="numeric"
                autoComplete="off"
                defaultValue={v?.minStock ?? String(product?.minStock ?? 0)}
                className={INPUT}
              />
            </Field>
          </div>
        ) : null}

        <fieldset className="flex flex-col gap-2 rounded-ctl border border-line p-3">
          <legend className="px-1 text-muted text-sm">Precio por mayor</legend>
          <p className="text-muted text-xs">
            Desde cierta cantidad, todas las unidades se cobran al precio indicado. Opcional.
          </p>
          {tierRows.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: filas editables sin id propio
            <div key={i} className="flex items-end gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1 text-muted text-xs">
                <label htmlFor={`pf-tier-qty-${i}`}>Desde (unidades)</label>
                <input
                  id={`pf-tier-qty-${i}`}
                  name="tierMinQty"
                  inputMode="numeric"
                  autoComplete="off"
                  value={row.minQty}
                  onChange={(e) => {
                    const minQty = e.currentTarget.value
                    setTierRows((rows) => rows.map((r, j) => (j === i ? { ...r, minQty } : r)))
                  }}
                  className={INPUT}
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1 text-muted text-xs">
                <label htmlFor={`pf-tier-price-${i}`}>Precio c/u (S/)</label>
                <input
                  id={`pf-tier-price-${i}`}
                  name="tierPrice"
                  inputMode="decimal"
                  autoComplete="off"
                  value={row.price}
                  onChange={(e) => {
                    const price = e.currentTarget.value
                    setTierRows((rows) => rows.map((r, j) => (j === i ? { ...r, price } : r)))
                  }}
                  className={INPUT}
                />
              </div>
              <button
                type="button"
                aria-label={`Quitar nivel ${i + 1}`}
                onClick={() => setTierRows((rows) => rows.filter((_, j) => j !== i))}
                className="h-11 w-11 flex-none cursor-pointer rounded-ctl border border-line hover:bg-surface-2"
              >
                ×
              </button>
            </div>
          ))}
          {tierRows.length < MAX_TIERS ? (
            <button
              type="button"
              onClick={() => setTierRows((rows) => [...rows, { minQty: '', price: '' }])}
              className="h-9 cursor-pointer self-start rounded-ctl border border-line px-3 text-sm hover:bg-surface-2"
            >
              Agregar nivel
            </button>
          ) : null}
          {tierErrors.length > 0 || tierServerError ? (
            <ul role="alert" className="list-disc pl-4 text-bad text-xs">
              {(tierErrors.length > 0 ? tierErrors : [tierServerError]).map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          ) : null}
        </fieldset>

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
            disabled={tierErrors.length > 0}
            pendingLabel="Guardando…"
            className="h-10 rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm"
          >
            {editing ? 'Guardar cambios' : 'Crear producto'}
          </SubmitButton>
        </div>
      </form>
    </>
  )
}
