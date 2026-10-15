'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { db } from '@/lib/db'
import { isNextControlFlow, uniqueViolation } from '@/lib/errors'
import {
  ForbiddenError,
  getCurrentMember,
  type Permissions,
  requirePermission,
} from '@/lib/session'
import {
  createCategory,
  createProduct,
  deleteCategory,
  renameCategory,
  setProductActive,
  updateProduct,
} from './data/products'
import { categoryNameSchema, idSchema, productInputSchema } from './lib/schemas'

/** Valores crudos del formulario de producto, para repoblarlo tras un error. */
export type ProductFormValues = {
  name: string
  barcode: string
  price: string
  categoryName: string
  tracksStock: boolean
  initialStock: string
  minStock: string
}

export type FormState = {
  ok: boolean
  message?: string
  error?: string
  fieldErrors?: Record<string, string[] | undefined>
  values?: ProductFormValues
}

const GENERIC_ERROR = 'No se pudo completar la acción. Inténtalo de nuevo.'
const NOT_FOUND = 'No se encontró el elemento'

const text = (formData: FormData, key: string) => {
  const v = formData.get(key)
  return typeof v === 'string' ? v : ''
}

function revalidateCatalog() {
  revalidatePath('/productos')
  revalidatePath('/productos/categorias')
  revalidatePath('/caja')
}

/** Autoriza con la sesión: la bodega y el usuario salen de aquí, nunca del formulario. */
async function authorize(permissions: Permissions) {
  const current = await getCurrentMember()
  await requirePermission(permissions)
  return current
}

/** Traduce errores a mensajes seguros: jamás se filtra el error crudo al cliente. */
function toErrorState(
  e: unknown,
  { categoryField, values }: { categoryField: string; values?: ProductFormValues },
): FormState {
  if (isNextControlFlow(e)) throw e
  if (e instanceof ForbiddenError) return { ok: false, values, error: e.message }
  const constraint = uniqueViolation(e)
  if (constraint === 'product_org_barcode_uq') {
    return {
      ok: false,
      values,
      fieldErrors: { barcode: ['Ya existe un producto con ese código de barras'] },
    }
  }
  if (constraint === 'product_org_name_key_uq') {
    return {
      ok: false,
      values,
      fieldErrors: { name: ['Ya existe un producto con ese nombre'] },
    }
  }
  if (constraint === 'category_org_name_uq') {
    return {
      ok: false,
      values,
      fieldErrors: { [categoryField]: ['Ya existe una categoría con ese nombre'] },
    }
  }
  console.error('[productos] acción falló', e)
  return { ok: false, values, error: GENERIC_ERROR }
}

function readProductForm(formData: FormData) {
  const values: ProductFormValues = {
    name: text(formData, 'name'),
    barcode: text(formData, 'barcode'),
    price: text(formData, 'price'),
    categoryName: text(formData, 'categoryName'),
    tracksStock: formData.get('tracksStock') === 'on',
    initialStock: text(formData, 'initialStock'),
    minStock: text(formData, 'minStock'),
  }
  const parsed = productInputSchema.safeParse({
    name: values.name,
    barcode: values.barcode,
    priceCents: values.price,
    categoryName: values.categoryName,
    tracksStock: values.tracksStock,
    initialStock: values.initialStock,
    minStock: values.minStock,
  })
  return { values, parsed }
}

/** Zod nombra el campo `priceCents`; el input del formulario se llama `price`. */
function fieldErrorsOf(error: z.ZodError<z.output<typeof productInputSchema>>) {
  const { priceCents, ...rest } = z.flattenError(error).fieldErrors
  return { ...rest, price: priceCents }
}

export async function createProductAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { values, parsed } = readProductForm(formData)
  if (!parsed.success) return { ok: false, values, fieldErrors: fieldErrorsOf(parsed.error) }

  try {
    const { organization, user } = await authorize({ product: ['create'] })
    await createProduct(db, { orgId: organization.id, userId: user.id, input: parsed.data })
  } catch (e) {
    return toErrorState(e, { categoryField: 'categoryName', values })
  }

  revalidateCatalog()
  return { ok: true, message: `Producto ${parsed.data.name} creado` }
}

export async function updateProductAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { values, parsed } = readProductForm(formData)
  const id = idSchema.safeParse(text(formData, 'id'))
  if (!id.success) return { ok: false, values, error: NOT_FOUND }
  if (!parsed.success) return { ok: false, values, fieldErrors: fieldErrorsOf(parsed.error) }

  try {
    const { organization } = await authorize({ product: ['update'] })
    const res = await updateProduct(db, {
      orgId: organization.id,
      id: id.data,
      input: parsed.data,
    })
    if (!res) return { ok: false, values, error: NOT_FOUND }
  } catch (e) {
    return toErrorState(e, { categoryField: 'categoryName', values })
  }

  revalidateCatalog()
  return { ok: true, message: 'Producto actualizado' }
}

/** Desactivar = "eliminar" (permiso product:delete); reactivar usa product:update. */
export async function toggleActiveAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const id = idSchema.safeParse(text(formData, 'id'))
  const active = text(formData, 'active') === 'true'
  if (!id.success) return { ok: false, error: NOT_FOUND }

  try {
    const { organization } = await authorize({ product: [active ? 'update' : 'delete'] })
    const done = await setProductActive(db, { orgId: organization.id, id: id.data, active })
    if (!done) return { ok: false, error: NOT_FOUND }
  } catch (e) {
    return toErrorState(e, { categoryField: 'name' })
  }

  revalidateCatalog()
  return { ok: true, message: active ? 'Producto reactivado' : 'Producto desactivado' }
}

export async function createCategoryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const name = categoryNameSchema.safeParse(text(formData, 'name'))
  if (!name.success) {
    return { ok: false, fieldErrors: { name: [name.error.issues[0]?.message ?? GENERIC_ERROR] } }
  }

  try {
    const { organization } = await authorize({ product: ['create'] })
    await createCategory(db, { orgId: organization.id, name: name.data })
  } catch (e) {
    return toErrorState(e, { categoryField: 'name' })
  }

  revalidateCatalog()
  return { ok: true, message: 'Categoría creada' }
}

export async function renameCategoryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = idSchema.safeParse(text(formData, 'id'))
  const name = categoryNameSchema.safeParse(text(formData, 'name'))
  if (!id.success) return { ok: false, error: NOT_FOUND }
  if (!name.success) {
    return { ok: false, fieldErrors: { name: [name.error.issues[0]?.message ?? GENERIC_ERROR] } }
  }

  try {
    const { organization } = await authorize({ product: ['update'] })
    const done = await renameCategory(db, {
      orgId: organization.id,
      id: id.data,
      name: name.data,
    })
    if (!done) return { ok: false, error: NOT_FOUND }
  } catch (e) {
    return toErrorState(e, { categoryField: 'name' })
  }

  revalidateCatalog()
  return { ok: true, message: 'Categoría renombrada' }
}

export async function deleteCategoryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const id = idSchema.safeParse(text(formData, 'id'))
  if (!id.success) return { ok: false, error: NOT_FOUND }

  try {
    const { organization } = await authorize({ product: ['delete'] })
    const done = await deleteCategory(db, { orgId: organization.id, id: id.data })
    if (!done) return { ok: false, error: NOT_FOUND }
  } catch (e) {
    return toErrorState(e, { categoryField: 'name' })
  }

  revalidateCatalog()
  return { ok: true, message: 'Categoría eliminada' }
}
