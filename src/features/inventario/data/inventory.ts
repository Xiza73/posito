import { and, asc, desc, eq, gte, ilike, inArray, lt, or, type SQL, sql } from 'drizzle-orm'
import { category, member, product, sale, stockMovement, user } from '@/db/schema'
import type { Db } from '@/lib/db-types'
import { limaRangeToUtc } from '@/lib/lima-time'
import { type MovementFilters, PAGE_SIZE, type StockFilters } from '../lib/filters'
import type { MovementType } from '../lib/labels'
import { COUNT_REASON, MAX_BATCH_LINES } from '../lib/schemas'

// Todas las funciones reciben `db` (o una transacción) para probarlas con PGlite. `orgId` y
// `userId` salen SIEMPRE de la sesión (getCurrentMember), nunca del cliente.
//
// Reglas de stock (CLAUDE.md §7): stock_movement es la fuente de verdad (append-only) y
// product.stock la caché; ambos se escriben en la MISMA transacción, con los productos bloqueados
// `FOR UPDATE` en orden de id (mismo orden que el cobro, para no generar deadlocks).

const MAX_INT = 2_147_483_647

/** Errores con mensaje listo para mostrar al usuario (las acciones los devuelven tal cual). */
export class InventoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InventoryError'
  }
}
export class ProductNotFoundError extends InventoryError {
  constructor() {
    super('No se encontró el producto')
    this.name = 'ProductNotFoundError'
  }
}
export class InactiveProductError extends InventoryError {
  constructor(name: string) {
    super(`«${name}» está inactivo. Reactívalo en Productos para modificar su stock.`)
    this.name = 'InactiveProductError'
  }
}
export class UntrackedProductError extends InventoryError {
  constructor(name: string) {
    super(`«${name}» no controla stock.`)
    this.name = 'UntrackedProductError'
  }
}
export class InsufficientStockError extends InventoryError {
  constructor(name: string, available: number, requested: number) {
    super(`No puedes restar ${requested} u. de «${name}»: solo hay ${available} disponibles.`)
    this.name = 'InsufficientStockError'
  }
}
export class StockOverflowError extends InventoryError {
  constructor(name: string) {
    super(`El stock de «${name}» superaría el máximo permitido.`)
    this.name = 'StockOverflowError'
  }
}

// --- Lectura: stock ---

export type StockRow = {
  id: string
  name: string
  barcode: string | null
  categoryName: string | null
  stock: number
  minStock: number
  tracksStock: boolean
  active: boolean
}

export type StockSummary = {
  /** Productos activos que controlan stock. */
  tracked: number
  /** Stock bajo: 0 < stock <= mínimo. */
  low: number
  /** Agotados: stock = 0. */
  out: number
}

/** Escapa los comodines de LIKE para que la búsqueda sea literal. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&')

const num = (expr: SQL) => sql<number>`${expr}`.mapWith(Number)

function stockWhere(orgId: string, f: StockFilters): SQL {
  const q = f.query.trim()
  const pattern = `%${escapeLike(q)}%`
  const conds: (SQL | undefined)[] = [
    eq(product.organizationId, orgId),
    f.includeInactive ? undefined : eq(product.active, true),
    f.categoryId ? eq(product.categoryId, f.categoryId) : undefined,
    q ? or(ilike(product.name, pattern), ilike(product.barcode, pattern)) : undefined,
  ]
  // Mismas reglas que stockStatus (src/lib/stock-status.ts), expresadas en SQL
  if (f.status === 'agotado') conds.push(and(eq(product.tracksStock, true), eq(product.stock, 0)))
  if (f.status === 'bajo') {
    conds.push(
      and(
        eq(product.tracksStock, true),
        sql`${product.stock} > 0`,
        sql`${product.stock} <= ${product.minStock}`,
      ),
    )
  }
  return and(...conds) as SQL
}

const stockColumns = {
  id: product.id,
  name: product.name,
  barcode: product.barcode,
  categoryName: category.name,
  stock: product.stock,
  minStock: product.minStock,
  tracksStock: product.tracksStock,
  active: product.active,
}

/** Productos de la bodega con su stock, por nombre. */
export async function listStock(
  db: Db,
  { orgId, filters }: { orgId: string; filters: StockFilters },
): Promise<StockRow[]> {
  return db
    .select(stockColumns)
    .from(product)
    .leftJoin(category, eq(category.id, product.categoryId))
    .where(stockWhere(orgId, filters))
    .orderBy(asc(product.name), asc(product.id))
}

/** Mismas filas y filtros que `listStock`: lo que se ve es lo que se exporta. */
export const exportStockRows = listStock

/** Conteos de la bodega (productos activos que controlan stock), independientes de los filtros. */
export async function stockSummary(db: Db, orgId: string): Promise<StockSummary> {
  const [r] = await db
    .select({
      tracked: num(sql`count(*)`),
      low: num(
        sql`count(*) filter (where ${product.stock} > 0 and ${product.stock} <= ${product.minStock})`,
      ),
      out: num(sql`count(*) filter (where ${product.stock} = 0)`),
    })
    .from(product)
    .where(
      and(
        eq(product.organizationId, orgId),
        eq(product.active, true),
        eq(product.tracksStock, true),
      ),
    )
  return r
}

/** Un producto de la bodega con su stock; null si no existe en ESA bodega. */
export async function getStockItem(
  db: Db,
  { orgId, productId }: { orgId: string; productId: string },
): Promise<StockRow | null> {
  const [row] = await db
    .select(stockColumns)
    .from(product)
    .leftJoin(category, eq(category.id, product.categoryId))
    .where(and(eq(product.id, productId), eq(product.organizationId, orgId)))
    .limit(1)
  return row ?? null
}

/** Productos sobre los que se puede mover stock (activos y con control de stock), para el lote. */
export async function listAdjustableProducts(
  db: Db,
  orgId: string,
): Promise<{ id: string; name: string; barcode: string | null; stock: number }[]> {
  return db
    .select({ id: product.id, name: product.name, barcode: product.barcode, stock: product.stock })
    .from(product)
    .where(
      and(
        eq(product.organizationId, orgId),
        eq(product.active, true),
        eq(product.tracksStock, true),
      ),
    )
    .orderBy(asc(product.name), asc(product.id))
}

/** Categorías de la bodega para el filtro. */
export async function listCategoryOptions(
  db: Db,
  orgId: string,
): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: category.id, name: category.name })
    .from(category)
    .where(eq(category.organizationId, orgId))
    .orderBy(asc(category.name))
}

// --- Escritura ---

/** Bloquea los productos (acotados por bodega) en orden de id y valida que existan. */
async function lockProducts(db: Db, orgId: string, ids: string[]) {
  if (ids.length === 0) throw new ProductNotFoundError()
  const rows = await db
    .select({
      id: product.id,
      name: product.name,
      stock: product.stock,
      tracksStock: product.tracksStock,
      active: product.active,
    })
    .from(product)
    .where(and(eq(product.organizationId, orgId), inArray(product.id, ids)))
    .orderBy(asc(product.id))
    .for('update')
  if (rows.length !== ids.length) throw new ProductNotFoundError()
  return rows
}

type Locked = Awaited<ReturnType<typeof lockProducts>>[number]

/** Sin ajustes sobre productos inactivos ni sobre los que no controlan stock. */
function assertAdjustable(p: Locked): void {
  if (!p.active) throw new InactiveProductError(p.name)
  if (!p.tracksStock) throw new UntrackedProductError(p.name)
}

const assertFits = (p: Locked, delta: number) => {
  if (p.stock + delta > MAX_INT) throw new StockOverflowError(p.name)
}

export type IngresoResult = {
  lines: { productId: string; name: string; quantity: number; stock: number }[]
  units: number
}

/**
 * Ingreso de mercadería (una o varias líneas) en UNA transacción. Si un producto se repite, sus
 * cantidades se unen: un movimiento `ingreso` por producto. Todo o nada.
 */
export async function registerIngreso(
  db: Db,
  params: {
    orgId: string
    userId: string
    lines: { productId: string; quantity: number }[]
    note: string | null
  },
): Promise<IngresoResult> {
  const { orgId, userId, lines, note } = params
  if (lines.length === 0) throw new InventoryError('Agrega al menos un producto')
  if (lines.length > MAX_BATCH_LINES) {
    throw new InventoryError(`Máximo ${MAX_BATCH_LINES} productos por ingreso`)
  }

  const merged = new Map<string, number>()
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) {
      throw new InventoryError('Las cantidades deben ser números enteros mayores que 0')
    }
    merged.set(l.productId, (merged.get(l.productId) ?? 0) + l.quantity)
  }
  const ids = [...merged.keys()].sort()

  return db.transaction(async (tx) => {
    const products = await lockProducts(tx, orgId, ids)
    for (const p of products) assertAdjustable(p)
    for (const p of products) assertFits(p, merged.get(p.id) ?? 0)

    await tx.insert(stockMovement).values(
      products.map((p) => ({
        organizationId: orgId,
        productId: p.id,
        type: 'ingreso' as const,
        quantity: merged.get(p.id) ?? 0,
        userId,
        reason: note,
      })),
    )
    for (const p of products) {
      await tx
        .update(product)
        .set({ stock: sql`${product.stock} + ${merged.get(p.id) ?? 0}` })
        .where(and(eq(product.id, p.id), eq(product.organizationId, orgId)))
    }

    const result = products.map((p) => {
      const quantity = merged.get(p.id) ?? 0
      return { productId: p.id, name: p.name, quantity, stock: p.stock + quantity }
    })
    return { lines: result, units: result.reduce((a, l) => a + l.quantity, 0) }
  })
}

/** Inserta un movimiento `ajuste` y actualiza la caché; el producto ya viene bloqueado. */
async function writeAdjustment(
  db: Db,
  p: { orgId: string; userId: string; product: Locked; delta: number; reason: string },
) {
  await db.insert(stockMovement).values({
    organizationId: p.orgId,
    productId: p.product.id,
    type: 'ajuste',
    quantity: p.delta,
    userId: p.userId,
    reason: p.reason,
  })
  await db
    .update(product)
    .set({ stock: sql`${product.stock} + ${p.delta}` })
    .where(and(eq(product.id, p.product.id), eq(product.organizationId, p.orgId)))
}

export type AdjustResult = { name: string; previous: number; stock: number }

/** Ajuste manual con signo (+/-) y motivo obligatorio. El resultado no puede quedar negativo. */
export async function adjustStock(
  db: Db,
  params: { orgId: string; userId: string; productId: string; delta: number; reason: string },
): Promise<AdjustResult> {
  const { orgId, userId, productId, delta } = params
  const reason = params.reason.trim()
  if (!Number.isInteger(delta) || delta === 0) {
    throw new InventoryError('La cantidad debe ser un número entero distinto de 0')
  }
  if (reason === '') throw new InventoryError('Indica el motivo del ajuste')

  return db.transaction(async (tx) => {
    const [p] = await lockProducts(tx, orgId, [productId])
    assertAdjustable(p)
    if (p.stock + delta < 0) throw new InsufficientStockError(p.name, p.stock, -delta)
    assertFits(p, delta)
    await writeAdjustment(tx, { orgId, userId, product: p, delta, reason })
    return { name: p.name, previous: p.stock, stock: p.stock + delta }
  })
}

export type CountResult = {
  name: string
  /** false = el conteo coincide con el stock: no se registró nada. */
  changed: boolean
  previous: number
  stock: number
  delta: number
}

/**
 * Conteo físico: la diferencia se calcula contra el stock LEÍDO BAJO BLOQUEO, nunca contra lo que
 * vio el cliente (puede haber vendido o ingresado mientras contaba). Si coincide, no registra nada.
 */
export async function countStock(
  db: Db,
  params: {
    orgId: string
    userId: string
    productId: string
    counted: number
    note: string | null
  },
): Promise<CountResult> {
  const { orgId, userId, productId, counted, note } = params
  if (!Number.isInteger(counted) || counted < 0) {
    throw new InventoryError('La cantidad contada debe ser un número entero, 0 o más')
  }
  if (counted > MAX_INT) throw new InventoryError('La cantidad contada es demasiado grande')

  return db.transaction(async (tx) => {
    const [p] = await lockProducts(tx, orgId, [productId])
    assertAdjustable(p)
    const delta = counted - p.stock
    if (delta === 0) {
      return { name: p.name, changed: false, previous: p.stock, stock: p.stock, delta: 0 }
    }
    const reason = note ? `${COUNT_REASON}: ${note}` : COUNT_REASON
    await writeAdjustment(tx, { orgId, userId, product: p, delta, reason })
    return { name: p.name, changed: true, previous: p.stock, stock: counted, delta }
  })
}

// --- Lectura: movimientos ---

export type MovementRow = {
  id: string
  /** ISO 8601 */
  createdAt: string
  productId: string
  productName: string
  type: MovementType
  /** Con signo. */
  quantity: number
  reason: string | null
  userName: string | null
  saleId: string | null
  saleSeries: string | null
  saleNumber: number | null
  /** Quien cobró la venta: define si el visor puede abrirla (el cajero solo ve las suyas). */
  saleCashierId: string | null
}

export type MovementPage = { rows: MovementRow[]; page: number; hasNext: boolean }

async function movementPage(db: Db, where: SQL, page: number): Promise<MovementPage> {
  const p = Number.isInteger(page) && page >= 1 ? page : 1
  const rows = await db
    .select({
      id: stockMovement.id,
      createdAt: stockMovement.createdAt,
      productId: stockMovement.productId,
      productName: product.name,
      type: stockMovement.type,
      quantity: stockMovement.quantity,
      reason: stockMovement.reason,
      userName: user.name,
      saleId: stockMovement.saleId,
      saleSeries: sale.series,
      saleNumber: sale.number,
      saleCashierId: sale.cashierId,
    })
    .from(stockMovement)
    .innerJoin(product, eq(product.id, stockMovement.productId))
    .leftJoin(user, eq(user.id, stockMovement.userId))
    .leftJoin(sale, eq(sale.id, stockMovement.saleId))
    .where(where)
    .orderBy(desc(stockMovement.createdAt), desc(stockMovement.id))
    .limit(PAGE_SIZE + 1)
    .offset((p - 1) * PAGE_SIZE)

  return {
    rows: rows.slice(0, PAGE_SIZE).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    page: p,
    hasNext: rows.length > PAGE_SIZE,
  }
}

/** Historial global de la bodega (50 por página, el más reciente primero). */
export async function listMovements(
  db: Db,
  { orgId, filters, page = 1 }: { orgId: string; filters: MovementFilters; page?: number },
): Promise<MovementPage> {
  const { start, end } = limaRangeToUtc(filters.from, filters.to)
  const where = and(
    eq(stockMovement.organizationId, orgId),
    gte(stockMovement.createdAt, start),
    lt(stockMovement.createdAt, end),
    filters.type ? eq(stockMovement.type, filters.type) : undefined,
    filters.userId ? eq(stockMovement.userId, filters.userId) : undefined,
    filters.productId ? eq(stockMovement.productId, filters.productId) : undefined,
  ) as SQL
  return movementPage(db, where, page)
}

/** Historial completo (sin rango de fechas) de UN producto de la bodega. */
export async function productMovements(
  db: Db,
  { orgId, productId, page = 1 }: { orgId: string; productId: string; page?: number },
): Promise<MovementPage> {
  const where = and(
    eq(stockMovement.organizationId, orgId),
    eq(stockMovement.productId, productId),
  ) as SQL
  return movementPage(db, where, page)
}

/** Productos de la bodega (también inactivos: tienen historial) para el filtro. */
export async function listProductOptions(
  db: Db,
  orgId: string,
): Promise<{ id: string; name: string; active: boolean }[]> {
  return db
    .select({ id: product.id, name: product.name, active: product.active })
    .from(product)
    .where(eq(product.organizationId, orgId))
    .orderBy(asc(product.name), asc(product.id))
}

/** Personas con movimientos en la bodega: miembros actuales y quienes ya registraron alguno. */
export async function listMovementUsers(
  db: Db,
  orgId: string,
): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(
      or(
        inArray(
          user.id,
          db.select({ id: member.userId }).from(member).where(eq(member.organizationId, orgId)),
        ),
        inArray(
          user.id,
          db
            .select({ id: stockMovement.userId })
            .from(stockMovement)
            .where(eq(stockMovement.organizationId, orgId)),
        ),
      ),
    )
    .orderBy(asc(user.name))
}
