'use client'

import { useActionState, useRef, useState } from 'react'
import { INPUT } from '@/components/ui/field'
import { SubmitButton } from '@/components/ui/submit-button'
import {
  createCategoryAction,
  deleteCategoryAction,
  type FormState,
  renameCategoryAction,
} from '../actions'
import type { CategoryRow } from '../data/products'

const INITIAL: FormState = { ok: false }
const BTN =
  'h-9 cursor-pointer rounded-ctl border border-line px-3 font-medium text-sm hover:bg-surface-2 disabled:cursor-wait disabled:opacity-60'

const countLabel = (n: number) => (n === 1 ? '1 producto' : `${n} productos`)

export function CategoriesList({
  categories,
  canCreate,
}: {
  categories: CategoryRow[]
  canCreate: boolean
}) {
  return (
    <>
      {canCreate ? <NewCategoryForm /> : null}
      {categories.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-8 text-center text-muted text-sm">
          Aún no hay categorías. Crea una aquí o escribe un nombre nuevo en el formulario de
          producto.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-card border border-line bg-surface">
          {categories.map((c) => (
            <CategoryItem key={c.id} category={c} />
          ))}
        </ul>
      )}
    </>
  )
}

function NewCategoryForm() {
  const formRef = useRef<HTMLFormElement>(null)

  async function submit(prev: FormState, formData: FormData) {
    const result = await createCategoryAction(prev, formData)
    if (result.ok) formRef.current?.reset()
    return result
  }
  const [state, action] = useActionState(submit, INITIAL)
  const error = state.fieldErrors?.name?.[0] ?? state.error

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-start gap-2">
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <input
          name="name"
          aria-label="Nombre de la nueva categoría"
          placeholder="Nueva categoría"
          required
          minLength={2}
          maxLength={40}
          autoComplete="off"
          className={INPUT}
        />
        {error ? (
          <span role="alert" className="text-bad text-xs">
            {error}
          </span>
        ) : null}
        {state.ok && state.message ? (
          <span role="status" className="text-ok text-xs">
            {state.message}
          </span>
        ) : null}
      </div>
      <SubmitButton
        pendingLabel="Creando…"
        className="h-11 rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm"
      >
        Nueva categoría
      </SubmitButton>
    </form>
  )
}

function CategoryItem({ category }: { category: CategoryRow }) {
  const [renaming, setRenaming] = useState(false)

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 border-line border-t px-4 py-3 first:border-t-0">
      {renaming ? (
        <RenameForm category={category} onDone={() => setRenaming(false)} />
      ) : (
        <>
          <div className="min-w-0">
            <div className="font-medium">{category.name}</div>
            <div className="text-muted text-xs">{countLabel(category.productCount)}</div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setRenaming(true)}
              aria-label={`Renombrar ${category.name}`}
              className={BTN}
            >
              Renombrar
            </button>
            <DeleteButton category={category} />
          </div>
        </>
      )}
    </li>
  )
}

function RenameForm({ category, onDone }: { category: CategoryRow; onDone: () => void }) {
  async function submit(prev: FormState, formData: FormData) {
    const result = await renameCategoryAction(prev, formData)
    if (result.ok) onDone()
    return result
  }
  const [state, action] = useActionState(submit, INITIAL)
  const error = state.fieldErrors?.name?.[0] ?? state.error

  return (
    <form action={action} className="flex w-full flex-wrap items-start gap-2">
      <input type="hidden" name="id" value={category.id} />
      <div className="flex min-w-48 flex-1 flex-col gap-1">
        <input
          name="name"
          aria-label={`Nuevo nombre para ${category.name}`}
          defaultValue={category.name}
          required
          minLength={2}
          maxLength={40}
          autoComplete="off"
          // biome-ignore lint/a11y/noAutofocus: el usuario acaba de pedir renombrar; el foco va al campo
          autoFocus
          className={INPUT}
        />
        {error ? (
          <span role="alert" className="text-bad text-xs">
            {error}
          </span>
        ) : null}
      </div>
      <SubmitButton
        pendingLabel="Guardando…"
        className="h-11 rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm"
      >
        Guardar
      </SubmitButton>
      <button type="button" onClick={onDone} className="h-11 cursor-pointer px-3 text-sm">
        Cancelar
      </button>
    </form>
  )
}

function DeleteButton({ category }: { category: CategoryRow }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  async function submit(prev: FormState, formData: FormData) {
    const result = await deleteCategoryAction(prev, formData)
    if (result.ok) dialogRef.current?.close()
    return result
  }
  const [state, action] = useActionState(submit, INITIAL)
  const titleId = `delete-${category.id}`

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        aria-label={`Eliminar ${category.name}`}
        className={BTN}
      >
        Eliminar
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        className="m-auto w-[min(92vw,26rem)] rounded-card border border-line bg-surface p-6 text-ink shadow-pop backdrop:bg-black/40"
      >
        <h2 id={titleId} className="mb-2 font-semibold text-lg">
          Eliminar categoría
        </h2>
        <p className="mb-4 text-muted text-sm">
          {category.productCount > 0
            ? `«${category.name}» tiene ${countLabel(category.productCount)}. No se borrarán: quedarán sin categoría.`
            : `«${category.name}» no tiene productos.`}
        </p>
        <form action={action} className="flex flex-col gap-3">
          <input type="hidden" name="id" value={category.id} />
          {state.error ? (
            <p role="alert" className="text-bad text-sm">
              {state.error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="h-10 cursor-pointer rounded-ctl border border-line px-4 font-medium text-sm hover:bg-surface-2"
            >
              Cancelar
            </button>
            <SubmitButton
              pendingLabel="Eliminando…"
              className="h-10 rounded-ctl bg-bad px-4 font-semibold text-sm text-white"
            >
              Eliminar categoría
            </SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  )
}
