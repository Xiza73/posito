import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { customer, product, receiptSeries, sale, saleItem, stockMovement, user } from '@/db/schema'
import type { Db } from '@/lib/db-types'
import type { DocumentType } from '@/lib/document'
import { uniqueViolation } from '@/lib/errors'
import type { PaymentMethod } from '@/lib/payment'
import { DEFAULT_RECEIPT_SERIES } from '@/lib/receipt'
import type { SaleSummary } from '@/lib/receipt-lines'
import { MAX_QTY } from '../lib/schemas'
import { computeTotals } from '../lib/totals'

/** Error con mensaje apto para mostrar al usuario (el resto se registra y se oculta). */
const MAX_INT = 2_147_483_647

export class CheckoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CheckoutError'
  }
}

export class InsufficientStockError extends CheckoutError {
  constructor(
    readonly productName: string,
    readonly available: number,
  ) {
    super(
      available === 0
        ? `${productName} está agotado`
        : `Solo quedan ${available} de ${productName}`,
    )
    this.name = 'InsufficientStockError'
  }
}

export class ProductUnavailableError extends CheckoutError {
  constructor(productName?: string) {
    super(
      productName ? `${productName} ya no está disponible` : 'Un producto ya no está disponible',
    )
    this.name = 'ProductUnavailableError'
  }
}

export class CustomerUnavailableError extends CheckoutError {
  constructor() {
    super('El cliente ya no está disponible')
    this.name = 'CustomerUnavailableError'
  }
}

const GENERIC = 'No se pudo registrar la venta. Inténtalo de nuevo.'

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

export type CheckoutParams = {
  orgId: string
  userId: string
  /** Generado por el cliente: es la PK de la venta y la clave de idempotencia. */
  saleId: string
  paymentMethod: PaymentMethod
  /**
   * La venta queda 'pendiente' de validación. La decide la ACTION (ajuste de la bodega + rol
   * cajero), nunca el cliente. Una pendiente descuenta stock y toma correlativo igual que una
   * completada: el cliente se lleva la mercadería; rechazarla = anularla.
   */
  requireApproval: boolean
  /**
   * Cliente elegido en la caja (null/ausente = público general). Solo es un id: el servidor
   * verifica que sea de ESTA bodega y esté activo; nombre y documento salen de la DB.
   */
  customerId?: string | null
  /** Solo producto y cantidad: los precios SIEMPRE se leen de la DB. */
  items: { productId: string; quantity: number }[]
}

/** Suma las cantidades de un mismo producto y valida el rango. */
function mergeItems(items: CheckoutParams['items']): Map<string, number> {
  if (items.length === 0) throw new CheckoutError('El ticket está vacío')
  const merged = new Map<string, number>()
  for (const { productId, quantity } of items) {
    if (!Number.isInteger(quantity) || quantity < 1) throw new CheckoutError('Cantidad inválida')
    merged.set(productId, (merged.get(productId) ?? 0) + quantity)
  }
  for (const qty of merged.values()) {
    if (qty > MAX_QTY) throw new CheckoutError(`La cantidad máxima por producto es ${MAX_QTY}`)
  }
  return merged
}

/**
 * Cobra una venta en UNA transacción: correlativo, venta, líneas, movimientos de stock y caché
 * `product.stock`. Es idempotente por `saleId`: reintentar devuelve la misma venta (con su estado
 * ACTUAL, p. ej. ya aprobada) sin tocar stock.
 *
 * Concurrencia (PGlite es una sola conexión y no puede probarla; las garantías son estas):
 *  - `SELECT … FOR UPDATE` sobre los productos: dos cobros del mismo producto se serializan, así
 *    el segundo ve el stock ya descontado y no se puede vender de más. Se bloquea en orden de `id`
 *    para evitar deadlocks entre carritos con los mismos productos.
 *  - El upsert de `receipt_series` bloquea la fila de la bodega hasta el commit: los correlativos
 *    salen sin huecos ni duplicados.
 *  - El índice único (org, serie, número) es la red de seguridad final.
 */
export async function checkout(db: Db, params: CheckoutParams): Promise<SaleSummary> {
  const { orgId, userId, saleId, paymentMethod, requireApproval, customerId = null } = params
  const merged = mergeItems(params.items)

  try {
    return await db.transaction(async (tx) => {
      const existing = await findExisting(tx, orgId, userId, saleId)
      if (existing) return existing

      const ids = [...merged.keys()].sort()
      const products = await tx
        .select()
        .from(product)
        .where(
          and(
            eq(product.organizationId, orgId),
            inArray(product.id, ids),
            eq(product.active, true),
          ),
        )
        .orderBy(asc(product.id))
        .for('update')

      // Un reintento gemelo pudo confirmarse mientras esperábamos el bloqueo: si ya existe, listo.
      const twin = await findExisting(tx, orgId, userId, saleId)
      if (twin) return twin

      // Después del reintento gemelo: reintentar una venta ya guardada no depende de que el cliente
      // siga activo. Esta MISMA consulta verifica (bodega + activo) y trae el snapshot que se
      // guarda en la venta; `FOR SHARE` impide que lo editen o desactiven hasta el commit.
      let snapshot: {
        name: string
        documentType: DocumentType | null
        documentNumber: string | null
      } | null = null
      if (customerId) {
        const [found] = await tx
          .select({
            name: customer.name,
            documentType: customer.documentType,
            documentNumber: customer.documentNumber,
          })
          .from(customer)
          .where(
            and(
              eq(customer.id, customerId),
              eq(customer.organizationId, orgId),
              eq(customer.active, true),
            ),
          )
          .limit(1)
          .for('share')
        if (!found) throw new CustomerUnavailableError()
        snapshot = found
      }

      if (products.length !== ids.length) throw await unavailable(tx, orgId, ids, products)

      const priced = products.map((p) => ({ p, qty: merged.get(p.id) ?? 0 }))
      for (const { p, qty } of priced) {
        if (p.tracksStock && p.stock < qty) throw new InsufficientStockError(p.name, p.stock)
      }

      const totals = computeTotals(
        priced.map(({ p, qty }) => ({ unitPriceCents: p.priceCents, qty })),
      )

      // La columna es integer (máx. 2 147 483 647 céntimos ≈ S/ 21 millones): error claro, no un crash
      const tooBig = (n: number) => n > MAX_INT
      if (tooBig(totals.total) || priced.some(({ p, qty }) => tooBig(p.priceCents * qty))) {
        throw new CheckoutError('El total de la venta supera el máximo permitido')
      }

      // Por qué no MAX(number)+1: dos cobros simultáneos leerían el mismo máximo y chocarían.
      // El upsert es una sola sentencia atómica y la fila queda bloqueada hasta el commit.
      const [counter] = await tx
        .insert(receiptSeries)
        .values({ organizationId: orgId, series: DEFAULT_RECEIPT_SERIES, lastNumber: 1 })
        .onConflictDoUpdate({
          target: receiptSeries.organizationId,
          set: { lastNumber: sql`${receiptSeries.lastNumber} + 1`, updatedAt: sql`now()` },
        })
        .returning({ series: receiptSeries.series, number: receiptSeries.lastNumber })

      await tx.insert(sale).values({
        id: saleId,
        organizationId: orgId,
        series: counter.series,
        number: counter.number,
        cashierId: userId,
        customerId,
        customerName: snapshot?.name ?? null,
        customerDocumentType: snapshot?.documentType ?? null,
        customerDocumentNumber: snapshot?.documentNumber ?? null,
        paymentMethod,
        subtotalCents: totals.subtotal,
        igvCents: totals.igv,
        totalCents: totals.total,
        status: requireApproval ? 'pendiente' : 'completada',
      })

      await tx.insert(saleItem).values(
        priced.map(({ p, qty }) => ({
          saleId,
          productId: p.id,
          productName: p.name,
          unitPriceCents: p.priceCents,
          quantity: qty,
          lineTotalCents: p.priceCents * qty,
        })),
      )

      // Un solo INSERT para los movimientos: menos tiempo con los bloqueos tomados
      const tracked = priced.filter(({ p }) => p.tracksStock)
      if (tracked.length > 0) {
        await tx.insert(stockMovement).values(
          tracked.map(({ p, qty }) => ({
            organizationId: orgId,
            productId: p.id,
            type: 'venta' as const,
            quantity: -qty,
            saleId,
            userId,
          })),
        )
      }
      for (const { p, qty } of tracked) {
        await tx
          .update(product)
          .set({ stock: sql`${product.stock} - ${qty}` })
          .where(and(eq(product.id, p.id), eq(product.organizationId, orgId)))
      }

      const created = await findExisting(tx, orgId, userId, saleId)
      if (!created) throw new Error('La venta recién creada no se encontró')
      return created
    })
  } catch (e) {
    if (uniqueViolation(e) === 'sale_org_series_number_uq') {
      throw new CheckoutError(
        'El número de boleta ya existe. Pide a un administrador revisar la numeración en Configuración.',
      )
    }
    throw e
  }
}

/** Venta ya registrada con ese id: de esta bodega se devuelve; de otra, error genérico. */
async function findExisting(
  tx: Tx,
  orgId: string,
  userId: string,
  saleId: string,
): Promise<SaleSummary | null> {
  const [row] = await tx
    .select({
      id: sale.id,
      organizationId: sale.organizationId,
      cashierId: sale.cashierId,
      series: sale.series,
      number: sale.number,
      createdAt: sale.createdAt,
      paymentMethod: sale.paymentMethod,
      subtotalCents: sale.subtotalCents,
      igvCents: sale.igvCents,
      totalCents: sale.totalCents,
      cashierName: user.name,
      status: sale.status,
      voidedAt: sale.voidedAt,
      voidReason: sale.voidReason,
      customerId: sale.customerId,
      customerName: sale.customerName,
      customerDocumentType: sale.customerDocumentType,
      customerDocumentNumber: sale.customerDocumentNumber,
    })
    .from(sale)
    .leftJoin(user, eq(user.id, sale.cashierId))
    .where(eq(sale.id, saleId))
    .limit(1)
  if (!row) return null
  // Sin pistas: no se revela que el id existe en otra bodega
  // y el reintento solo devuelve ventas propias del cajero (no sirve para leer ventas ajenas)
  if (row.organizationId !== orgId || row.cashierId !== userId) throw new CheckoutError(GENERIC)

  const items = await tx
    .select({
      name: saleItem.productName,
      qty: saleItem.quantity,
      unitPriceCents: saleItem.unitPriceCents,
      lineTotalCents: saleItem.lineTotalCents,
    })
    .from(saleItem)
    .where(eq(saleItem.saleId, saleId))
    .orderBy(asc(saleItem.productName))

  return {
    id: row.id,
    series: row.series,
    number: row.number,
    createdAt: row.createdAt.toISOString(),
    paymentMethod: row.paymentMethod,
    lines: items,
    subtotalCents: row.subtotalCents,
    igvCents: row.igvCents,
    totalCents: row.totalCents,
    cashierName: row.cashierName,
    // Snapshot de la venta, nunca el cliente vivo
    customer: row.customerName
      ? {
          id: row.customerId,
          name: row.customerName,
          documentType: row.customerDocumentType,
          documentNumber: row.customerDocumentNumber,
        }
      : null,
    status: row.status,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidReason: row.voidReason,
  }
}

/** Nombra el producto que falta solo si es de esta bodega (p. ej. desactivado). */
async function unavailable(
  tx: Tx,
  orgId: string,
  ids: string[],
  found: { id: string }[],
): Promise<ProductUnavailableError> {
  const foundIds = new Set(found.map((p) => p.id))
  const missing = ids.filter((id) => !foundIds.has(id))
  const [row] = await tx
    .select({ name: product.name })
    .from(product)
    .where(and(eq(product.organizationId, orgId), inArray(product.id, missing)))
    .limit(1)
  return new ProductUnavailableError(row?.name)
}
