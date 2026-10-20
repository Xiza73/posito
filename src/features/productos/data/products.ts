import { and, asc, eq, ilike, or, sql } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type * as schema from '@/db/schema'
import { category, product, productPriceTier, stockMovement } from '@/db/schema'
import { nameKey, normalizeDisplayName } from '@/lib/name-key'
import type { PriceTier } from '@/lib/pricing'
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
  /**
   * Costo (null = sin costo). Solo existe si el visor tiene `product:update` (`includeCost`); para
   * el resto la clave NO viaja (ni siquiera como null).
   */
  costCents?: number | null
  tracksStock: boolean
  stock: number
  minStock: number
  active: boolean
  /** Visible en la tienda online pública. */
  showInStore: boolean
  /** Base de la foto en Storage (src/lib/product-image.ts); null = sin foto. */
  imagePath: string | null
  categoryId: string | null
  categoryName: string | null
  /** Niveles de precio por mayor, de menor a mayor cantidad (vacío = sin). */
  tiers: PriceTier[]
}

export type CategoryRow = { id: string; name: string; productCount: number }

type ListOptions = {
  /** Solo para quien cumple `seesProductCost`: sin esto el costo ni se consulta. */
  includeCost?: boolean
  includeInactive?: boolean
  query?: string
  categoryId?: string
}

/** Escapa los comodines de LIKE para que la búsqueda sea literal. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&')

export async function listProducts(
  db: Db,
  orgId: string,
  { includeInactive = false, includeCost = false, query = '', categoryId }: ListOptions = {},
): Promise<ProductRow[]> {
  const q = query.trim()
  const pattern = `%${escapeLike(q)}%`
  const rows = await db
    .select({
      id: product.id,
      name: product.name,
      barcode: product.barcode,
      priceCents: product.priceCents,
      ...(includeCost ? { costCents: product.costCents } : {}),
      tracksStock: product.tracksStock,
      stock: product.stock,
      minStock: product.minStock,
      active: product.active,
      showInStore: product.showInStore,
      imagePath: product.imagePath,
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

  const tierRows = await db
    .select({
      productId: productPriceTier.productId,
      minQty: productPriceTier.minQty,
      unitPriceCents: productPriceTier.unitPriceCents,
    })
    .from(productPriceTier)
    .where(eq(productPriceTier.organizationId, orgId))
    .orderBy(asc(productPriceTier.minQty))
  const tiersOf = new Map<string, PriceTier[]>()
  for (const { productId, ...tier } of tierRows) {
    tiersOf.set(productId, [...(tiersOf.get(productId) ?? []), tier])
  }
  return rows.map((r) => ({ ...r, tiers: tiersOf.get(r.id) ?? [] }))
}

/**
 * Reemplaza TODOS los niveles del producto (borrar + insertar) dentro de la transacción del llamador.
 * Siempre acotado por bodega + producto. El producto ya se actualizó antes: esa fila queda bloqueada
 * y serializa este reemplazo con un cobro en curso (que bloquea los productos `FOR UPDATE`).
 */
async function replaceTiers(
  tx: Db,
  { orgId, productId, tiers }: { orgId: string; productId: string; tiers: PriceTier[] },
) {
  // Bloquea la fila del producto aquí mismo (idempotente dentro de la transacción): no depende de que
  // el llamador ya haya escrito el producto. Misma fila que bloquea el cobro (FOR UPDATE).
  const [locked] = await tx
    .select({ id: product.id })
    .from(product)
    .where(and(eq(product.id, productId), eq(product.organizationId, orgId)))
    .for('update')
  if (!locked) throw new Error('replaceTiers: el producto no existe en esta bodega')
  await tx
    .delete(productPriceTier)
    .where(
      and(eq(productPriceTier.organizationId, orgId), eq(productPriceTier.productId, productId)),
    )
  if (tiers.length === 0) return
  await tx
    .insert(productPriceTier)
    .values(tiers.map((t) => ({ organizationId: orgId, productId, ...t })))
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
        costCents: input.costCents ?? null,
        tracksStock: input.tracksStock,
        showInStore: input.showInStore ?? true,
        stock,
        minStock: input.tracksStock ? input.minStock : 0,
      })
      .returning({ id: product.id })

    if (input.tiers?.length) {
      await replaceTiers(tx, { orgId, productId: created.id, tiers: input.tiers })
    }

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
        // undefined = no tocar el costo (null lo quita)
        ...(input.costCents === undefined ? {} : { costCents: input.costCents }),
        tracksStock: input.tracksStock,
        ...(input.showInStore === undefined ? {} : { showInStore: input.showInStore }),
        minStock: input.tracksStock ? input.minStock : 0,
      })
      .where(and(eq(product.id, id), eq(product.organizationId, orgId)))
      .returning({ id: product.id })
    if (updated && input.tiers !== undefined) {
      await replaceTiers(tx, { orgId, productId: id, tiers: input.tiers })
    }
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

/** Base de la foto actual: undefined = el producto no existe en ESA bodega; null = sin foto. */
export async function getProductImagePath(
  db: Db,
  { orgId, id }: { orgId: string; id: string },
): Promise<string | null | undefined> {
  const [row] = await db
    .select({ imagePath: product.imagePath })
    .from(product)
    .where(and(eq(product.id, id), eq(product.organizationId, orgId)))
    .limit(1)
  return row ? row.imagePath : undefined
}

/**
 * Fija (o quita, con null) la foto; solo `clearProductImage` es público: fijar pasa por consumeUploadAndSetImage del producto en una transacción y devuelve la base ANTERIOR
 * para borrar sus objetos después del commit. null = el producto no existe en esa bodega.
 */
async function setProductImage(
  db: Db,
  { orgId, id, imagePath }: { orgId: string; id: string; imagePath: string | null },
): Promise<{ previous: string | null } | null> {
  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ imagePath: product.imagePath })
      .from(product)
      .where(and(eq(product.id, id), eq(product.organizationId, orgId)))
      .for('update')
    if (!found) return null
    await tx
      .update(product)
      .set({ imagePath })
      .where(and(eq(product.id, id), eq(product.organizationId, orgId)))
    return { previous: found.imagePath }
  })
}

export const clearProductImage = (db: Db, args: { orgId: string; id: string }) =>
  setProductImage(db, { ...args, imagePath: null })
