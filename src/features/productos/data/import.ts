import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { product, productPriceTier, stockMovement } from '@/db/schema'
import type { RawImportRow } from '../lib/import-parse'
import {
  type ClassifiedRow,
  classify,
  type ExistingProduct,
  type ImportPreview,
  type ImportSummary,
  indexExisting,
  toPreview,
  validateRows,
} from '../lib/import-validate'
import { type Db, findOrCreateCategory } from './products'

/** La importación chocó con un cambio concurrente (p. ej. se agregaron precios por mayor). */
export class ImportConflictError extends Error {
  constructor() {
    super('Otro usuario modificó los productos durante la importación')
    this.name = 'ImportConflictError'
  }
}

const BATCH = 500
const IMPORT_REASON = 'Importación'

function chunks<T>(items: T[], size = BATCH): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** Productos de la bodega (activos o no: el índice único los cubre a todos). */
async function loadExisting(db: Db, orgId: string): Promise<ExistingProduct[]> {
  return db
    .select({
      id: product.id,
      name: product.name,
      nameKey: product.nameKey,
      barcode: product.barcode,
      tracksStock: product.tracksStock,
      priceCents: product.priceCents,
      // SQL a mano: drizzle renderiza las columnas sin tabla en un select de una sola tabla y `id` chocaría
      hasTiers: sql<boolean>`exists (select 1 from product_price_tier t where t.product_id = product.id)`,
    })
    .from(product)
    .where(eq(product.organizationId, orgId))
}

/** Valida y clasifica contra el catálogo vigente. Sin escrituras. */
export async function previewImport(
  db: Db,
  { orgId, rows }: { orgId: string; rows: RawImportRow[] },
): Promise<ImportPreview> {
  const existing = indexExisting(await loadExisting(db, orgId))
  // La vista previa no conoce el interruptor "Actualizar": avisa siempre del bloqueo por niveles
  return toPreview(rows, classify(validateRows(rows), existing))
}

/**
 * Aplica la importación en UNA transacción. Re-valida y re-clasifica con el catálogo de ESE
 * momento (la vista previa pudo quedar obsoleta). El stock del archivo SIEMPRE se suma como
 * movimiento `ingreso`, nunca pisa el stock actual. Si otra transacción crea un producto
 * igual a la vez, el índice único aborta todo (el llamador traduce la violación 23505).
 */
export async function commitImport(
  db: Db,
  {
    orgId,
    userId,
    rows,
    updateExisting,
    allowCost = false,
  }: {
    orgId: string
    userId: string
    rows: RawImportRow[]
    updateExisting: boolean
    /** `seesProductCost(rol)`: sin esto el costo del archivo se ignora (nunca se escribe). Falla cerrado. */
    allowCost?: boolean
  },
): Promise<ImportSummary> {
  return db.transaction(async (tx) => {
    const existing = indexExisting(await loadExisting(tx, orgId))
    const validated = validateRows(rows).map((v) =>
      allowCost || !v.input ? v : { ...v, input: { ...v.input, costCents: null } },
    )
    const all = classify(validated, existing, { blockTieredPriceChange: updateExisting })

    const toCreate = all.filter((r) => r.status === 'new')
    const toUpdate = updateExisting ? all.filter((r) => r.status === 'existing') : []
    const summary: ImportSummary = {
      created: toCreate.length,
      updated: toUpdate.length,
      skipped: all.filter(
        (r) => r.status === 'duplicate' || (!updateExisting && r.status === 'existing'),
      ).length,
      errors: all.filter((r) => r.status === 'error').length,
    }

    // Categorías: una por clave distinta (nombre visible = primera aparición), solo las que se usan
    const categoryIds = new Map<string, string>()
    for (const r of [...toCreate, ...toUpdate]) {
      const input = r.input
      if (!input?.categoryKey || !input.categoryName || categoryIds.has(input.categoryKey)) continue
      categoryIds.set(input.categoryKey, await findOrCreateCategory(tx, orgId, input.categoryName))
    }
    const categoryOf = (r: ClassifiedRow) =>
      r.input?.categoryKey ? (categoryIds.get(r.input.categoryKey) ?? null) : null

    const movements: { productId: string; quantity: number }[] = []

    for (const batch of chunks(toCreate)) {
      const inserted = await tx
        .insert(product)
        .values(
          batch.map((r) => {
            // biome-ignore lint/style/noNonNullAssertion: las filas 'new' siempre traen input
            const i = r.input!
            return {
              organizationId: orgId,
              categoryId: categoryOf(r),
              name: i.name,
              nameKey: i.nameKey,
              barcode: i.barcode,
              priceCents: i.priceCents,
              costCents: i.costCents,
              tracksStock: i.tracksStock,
              stock: i.stock,
              minStock: i.minStock,
            }
          }),
        )
        .returning({ id: product.id, nameKey: product.nameKey })
      const idByKey = new Map(inserted.map((p) => [p.nameKey, p.id]))
      for (const r of batch) {
        // biome-ignore lint/style/noNonNullAssertion: ídem
        const i = r.input!
        const id = idByKey.get(i.nameKey)
        if (id && i.stock > 0) movements.push({ productId: id, quantity: i.stock })
      }
    }

    // Existentes: solo precio, costo y categoría (si el archivo trae uno) + stock sumado
    const updates = toUpdate.map((r) => {
      // biome-ignore lint/style/noNonNullAssertion: las filas 'existing' siempre traen input y existing
      const [i, e] = [r.input!, r.existing!]
      const add = e.tracksStock ? i.stock : 0
      if (add > 0) movements.push({ productId: e.id, quantity: add })
      return { id: e.id, price: i.priceCents, cost: i.costCents, category: categoryOf(r), add }
    })
    // Orden de bloqueo: SIEMPRE por id (igual que el cobro, que bloquea productos ORDER BY id). Sin esto el
    // UPDATE masivo tomaría los locks en el orden del plan y podría hacer deadlock con un cobro.
    if (updates.length > 0) {
      const ids = updates.map((u) => u.id)
      await tx
        .select({ id: product.id })
        .from(product)
        .where(and(eq(product.organizationId, orgId), inArray(product.id, ids)))
        .orderBy(asc(product.id))
        .for('update')
      // Con las filas ya bloqueadas: ¿alguien les agregó precios por mayor desde la clasificación?
      const tiered = await tx
        .select({ id: productPriceTier.productId })
        .from(productPriceTier)
        .where(inArray(productPriceTier.productId, ids))
      const tieredIds = new Set(tiered.map((t) => t.id))
      const priceOf = new Map(toUpdate.map((r) => [r.existing?.id, r.existing?.priceCents]))
      if (updates.some((u) => tieredIds.has(u.id) && priceOf.get(u.id) !== u.price)) {
        throw new ImportConflictError()
      }
    }
    for (const batch of chunks(updates)) {
      const values = sql.join(
        batch.map(
          (u) =>
            sql`(${u.id}::uuid, ${u.price}::int, ${u.cost}::int, ${u.category}::uuid, ${u.add}::int)`,
        ),
        sql`, `,
      )
      await tx.execute(sql`
        update product as p
        set price_cents = v.price,
            cost_cents = coalesce(v.cost, p.cost_cents),
            category_id = coalesce(v.category, p.category_id),
            stock = p.stock + v.qty,
            updated_at = now()
        from (values ${values}) as v(id, price, cost, category, qty)
        where p.id = v.id and p.organization_id = ${orgId}
      `)
    }

    for (const batch of chunks(movements)) {
      await tx.insert(stockMovement).values(
        batch.map((m) => ({
          organizationId: orgId,
          productId: m.productId,
          type: 'ingreso' as const,
          quantity: m.quantity,
          userId,
          reason: IMPORT_REASON,
        })),
      )
    }

    return summary
  })
}
