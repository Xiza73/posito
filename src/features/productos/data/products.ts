import { and, asc, eq, ilike, or, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type * as schema from '@/db/schema'
import { category, product, stockMovement } from '@/db/schema'
import { nameKey, normalizeDisplayName } from '@/lib/name-key'
import type { ProductInput } from '../lib/schemas'

// Todas las funciones reciben `db` (o una transacción) para poder probarlas con PGlite, y
// reciben `orgId` explícito: SIEMPRE sale de la sesión (getCurrentMember), nunca del cliente.
// biome-ignore lint/suspicious/noExplicitAny: el HKT del resultado difiere entre postgres-js y PGlite
export type Db = PgDatabase<any, typeof schema>

export type ProductRow = {
  id: string
  name: string
  barcode: string | null
  priceCents: number
  tracksStock: boolean
  stock: number
  minStock: number
  active: boolean
  categoryId: string | null
  categoryName: string | null
}

export type CategoryRow = { id: string; name: string; productCount: number }

type ListOptions = {
  includeInactive?: boolean
  query?: string
  categoryId?: string
}

/** Escapa los comodines de LIKE para que la búsqueda sea literal. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&')

export async function listProducts(
  db: Db,
  orgId: string,
  { includeInactive = false, query = '', categoryId }: ListOptions = {},
): Promise<ProductRow[]> {
  const q = query.trim()
  const pattern = `%${escapeLike(q)}%`
  return db
    .select({
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      priceCents: product.priceCents,
      tracksStock: product.tracksStock,
      stock: product.stock,
      minStock: product.minStock,
      active: product.active,
      categoryId: product.categoryId,
      categoryName: category.name,
    })
    .from(product)
    .leftJoin(category, eq(category.id, product.categoryId))
    .where(
      and(
        eq(product.organizationId, orgId),
        includeInactive ? undefined : eq(product.active, true),
        categoryId ? eq(product.categoryId, categoryId) : undefined,
        q ? or(ilike(product.name, pattern), ilike(product.barcode, pattern)) : undefined,
      ),
    )
    .orderBy(asc(product.name))
}

/** Busca la categoría por `name_key` (sin mayúsculas, tildes ni espacios sobrantes) en la bodega, o la crea. */
export async function findOrCreateCategory(db: Db, orgId: string, name: string): Promise<string> {
  const key = nameKey(name)
  // Insertar primero y, si ya existe, leer: dos altas simultáneas de "Hogar"/"hogar" terminan en
  // la MISMA categoría en vez de que la segunda falle (ON CONFLICT espera al commit de la otra).
  const [created] = await db
    .insert(category)
    .values({ organizationId: orgId, name: normalizeDisplayName(name), nameKey: key })
    .onConflictDoNothing({ target: [category.organizationId, category.nameKey] })
    .returning({ id: category.id })
  if (created) return created.id
  const [existing] = await db
    .select({ id: category.id })
    .from(category)
    .where(and(eq(category.organizationId, orgId), eq(category.nameKey, key)))
    .limit(1)
  return existing.id
}

/**
 * Alta de producto en UNA transacción: categoría nueva (opcional) -> producto -> movimiento
 * `ingreso` de stock inicial (solo si controla stock y N > 0). stock_movement es la fuente de
 * verdad; product.stock es la caché y se escribe en la misma transacción.
 */
export async function createProduct(
  db: Db,
  { orgId, userId, input }: { orgId: string; userId: string; input: ProductInput },
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const categoryId = input.categoryName
      ? await findOrCreateCategory(tx, orgId, input.categoryName)
      : null
    const stock = input.tracksStock ? input.initialStock : 0
    const [created] = await tx
      .insert(product)
      .values({
        organizationId: orgId,
        categoryId,
        name: normalizeDisplayName(input.name),
        nameKey: nameKey(input.name),
        barcode: input.barcode,
        priceCents: input.priceCents,
        tracksStock: input.tracksStock,
        stock,
        minStock: input.tracksStock ? input.minStock : 0,
      })
      .returning({ id: product.id })

    if (stock > 0) {
      await tx.insert(stockMovement).values({
        organizationId: orgId,
        productId: created.id,
        type: 'ingreso',
        quantity: stock,
        userId,
        reason: 'Stock inicial',
      })
    }
    return created
  })
}

/**
 * Edita un producto de la bodega. NO toca el stock (se ajusta desde Inventario).
 * Devuelve null si el producto no existe en ESA bodega (nunca actualiza filas de otra).
 */
export async function updateProduct(
  db: Db,
  { orgId, id, input }: { orgId: string; id: string; input: ProductInput },
): Promise<{ id: string } | null> {
  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ id: product.id })
      .from(product)
      .where(and(eq(product.id, id), eq(product.organizationId, orgId)))
      .limit(1)
    if (!found) return null

    const categoryId = input.categoryName
      ? await findOrCreateCategory(tx, orgId, input.categoryName)
      : null
    const [updated] = await tx
      .update(product)
      .set({
        categoryId,
        name: normalizeDisplayName(input.name),
        nameKey: nameKey(input.name),
        barcode: input.barcode,
        priceCents: input.priceCents,
        tracksStock: input.tracksStock,
        minStock: input.tracksStock ? input.minStock : 0,
      })
      .where(and(eq(product.id, id), eq(product.organizationId, orgId)))
      .returning({ id: product.id })
    return updated ?? null
  })
}

/** "Eliminar" = desactivar. Los productos no se borran (hay ventas que los referencian). */
export async function setProductActive(
  db: Db,
  { orgId, id, active }: { orgId: string; id: string; active: boolean },
): Promise<boolean> {
  const rows = await db
    .update(product)
    .set({ active })
    .where(and(eq(product.id, id), eq(product.organizationId, orgId)))
    .returning({ id: product.id })
  return rows.length > 0
}

export async function listCategoriesWithCounts(db: Db, orgId: string): Promise<CategoryRow[]> {
  return db
    .select({
      id: category.id,
      name: category.name,
      productCount: sql<number>`count(${product.id})::int`,
    })
    .from(category)
    .leftJoin(product, eq(product.categoryId, category.id))
    .where(eq(category.organizationId, orgId))
    .groupBy(category.id, category.name)
    .orderBy(asc(category.name))
}

/** Alta explícita desde Categorías. Un nombre repetido (según `nameKey`) viola `category_org_name_uq`. */
export async function createCategory(
  db: Db,
  { orgId, name }: { orgId: string; name: string },
): Promise<{ id: string }> {
  const [created] = await db
    .insert(category)
    .values({ organizationId: orgId, name: normalizeDisplayName(name), nameKey: nameKey(name) })
    .returning({ id: category.id })
  return created
}

export async function renameCategory(
  db: Db,
  { orgId, id, name }: { orgId: string; id: string; name: string },
): Promise<boolean> {
  const rows = await db
    .update(category)
    .set({ name: normalizeDisplayName(name), nameKey: nameKey(name) })
    .where(and(eq(category.id, id), eq(category.organizationId, orgId)))
    .returning({ id: category.id })
  return rows.length > 0
}

/** Los productos de la categoría quedan con categoryId = null (FK `set null`). */
export async function deleteCategory(
  db: Db,
  { orgId, id }: { orgId: string; id: string },
): Promise<boolean> {
  const rows = await db
    .delete(category)
    .where(and(eq(category.id, id), eq(category.organizationId, orgId)))
    .returning({ id: category.id })
  return rows.length > 0
}
