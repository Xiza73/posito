import { and, asc, count, desc, eq, inArray, max, type SQL, sql } from 'drizzle-orm'
import { customer, sale, user } from '@/db/schema'
import type { CustomerInput, CustomerOption } from '@/lib/customer-input'
import { createCustomer, customerSearchCondition, rethrowCustomerError } from '@/lib/customers'
import type { Db } from '@/lib/db-types'
import { nameKey, normalizeDisplayName } from '@/lib/name-key'
import type { PaymentMethod } from '@/lib/payment'
import { can, seesAllSales } from '@/lib/permissions'
import type { SaleStatus } from '@/lib/receipt-lines'
import type { CustomerExportRow } from '../lib/csv'
import { EXPORT_LIMIT, PAGE_SIZE } from '../lib/filters'

// Todas las funciones reciben `db` (o una transacción) para probarlas con PGlite. `orgId` y el
// `viewer` salen SIEMPRE de la sesión (getCurrentMember), nunca del cliente.

export { DuplicateDocumentError } from '@/lib/customers'

export type Viewer = { userId: string; role: string }

export type CustomerStats = {
  /** Ventas COMPLETADAS (las anuladas y las por validar no cuentan). */
  purchaseCount: number
  totalSpentCents: number
  /** ISO 8601 de la última venta completada. */
  lastPurchaseAt: string | null
}

/**
 * Fila de la LISTA: solo lo que se muestra. Va al componente cliente, así que no lleva correo ni
 * dirección (no deben viajar en el payload de la página si no se ven).
 */
export type CustomerListRow = CustomerOption & CustomerStats & { active: boolean }

export type CustomerRow = CustomerOption &
  CustomerStats & {
    email: string | null
    address: string | null
    active: boolean
    /** ISO 8601 */
    createdAt: string
  }

export type CustomerSaleRow = {
  id: string
  series: string
  number: number
  /** ISO 8601 */
  createdAt: string
  paymentMethod: PaymentMethod
  totalCents: number
  status: SaleStatus
  cashierName: string | null
}

const EMPTY_STATS: CustomerStats = { purchaseCount: 0, totalSpentCents: 0, lastPurchaseAt: null }

/** Cualquier rol que no sea admin/owner se trata como cajero: ante la duda, ve menos. */
const seesAll = (viewer: Viewer) => seesAllSales(viewer.role)

/** El cajero solo cuenta/ve SUS ventas (misma regla que Ventas, aplicada aquí en la capa de datos). */
const saleScope = (viewer: Viewer): SQL | undefined =>
  seesAll(viewer) ? undefined : eq(sale.cashierId, viewer.userId)

/** Inactivos solo para quien puede desactivar/reactivar (`customer:delete`); el resto, nunca. */
const seesInactive = (viewer: Viewer) => can(viewer.role, { customer: ['delete'] })

const listColumns = {
  id: customer.id,
  name: customer.name,
  documentType: customer.documentType,
  documentNumber: customer.documentNumber,
  phone: customer.phone,
  active: customer.active,
}

const columns = {
  id: customer.id,
  name: customer.name,
  documentType: customer.documentType,
  documentNumber: customer.documentNumber,
  phone: customer.phone,
  email: customer.email,
  address: customer.address,
  active: customer.active,
  createdAt: customer.createdAt,
}

/**
 * Compras de los clientes dados (solo ventas COMPLETADAS de esta bodega). Para un cajero, solo las
 * suyas: no debe poder deducir lo que vendieron los demás.
 */
async function statsFor(
  db: Db,
  { orgId, viewer, ids }: { orgId: string; viewer: Viewer; ids: string[] },
): Promise<Map<string, CustomerStats>> {
  const out = new Map<string, CustomerStats>()
  if (ids.length === 0) return out
  const rows = await db
    .select({
      customerId: sale.customerId,
      purchaseCount: count(),
      totalSpentCents: sql<number>`coalesce(sum(${sale.totalCents}), 0)`.mapWith(Number),
      lastPurchaseAt: max(sale.createdAt),
    })
    .from(sale)
    .where(
      and(
        eq(sale.organizationId, orgId),
        eq(sale.status, 'completada'),
        inArray(sale.customerId, ids),
        saleScope(viewer),
      ),
    )
    .groupBy(sale.customerId)
  for (const r of rows) {
    if (!r.customerId) continue
    out.set(r.customerId, {
      purchaseCount: r.purchaseCount,
      totalSpentCents: r.totalSpentCents,
      lastPurchaseAt: r.lastPurchaseAt ? new Date(r.lastPurchaseAt).toISOString() : null,
    })
  }
  return out
}

type CustomerBase = Omit<CustomerRow, keyof CustomerStats | 'createdAt'> & { createdAt: Date }

const withStats = (c: CustomerBase, stats: Map<string, CustomerStats>): CustomerRow => ({
  ...c,
  createdAt: c.createdAt.toISOString(),
  ...(stats.get(c.id) ?? EMPTY_STATS),
})

/** Una página (50) de clientes por nombre. `hasNext` evita un COUNT aparte. */
export async function listCustomers(
  db: Db,
  {
    orgId,
    viewer,
    query = '',
    includeInactive = false,
    page = 1,
  }: { orgId: string; viewer: Viewer; query?: string; includeInactive?: boolean; page?: number },
): Promise<{ rows: CustomerListRow[]; page: number; hasNext: boolean }> {
  const p = Number.isInteger(page) && page >= 1 ? page : 1
  const found = await db
    .select(listColumns)
    .from(customer)
    .where(
      and(
        eq(customer.organizationId, orgId),
        includeInactive && seesInactive(viewer) ? undefined : eq(customer.active, true),
        customerSearchCondition(query),
      ),
    )
    .orderBy(asc(customer.nameKey), asc(customer.id))
    .limit(PAGE_SIZE + 1)
    .offset((p - 1) * PAGE_SIZE)

  const pageRows = found.slice(0, PAGE_SIZE)
  const stats = await statsFor(db, { orgId, viewer, ids: pageRows.map((c) => c.id) })
  return {
    rows: pageRows.map((c) => ({ ...c, ...(stats.get(c.id) ?? EMPTY_STATS) })),
    page: p,
    hasNext: found.length > PAGE_SIZE,
  }
}

/**
 * Un cliente de ESTA bodega; null si no existe o es de otra. Quien no puede desactivar/reactivar
 * (cajero) tampoco ve los inactivos, ni siquiera por UUID.
 */
export async function getCustomer(
  db: Db,
  { orgId, viewer, id }: { orgId: string; viewer: Viewer; id: string },
): Promise<CustomerRow | null> {
  const [row] = await db
    .select(columns)
    .from(customer)
    .where(
      and(
        eq(customer.id, id),
        eq(customer.organizationId, orgId),
        seesInactive(viewer) ? undefined : eq(customer.active, true),
      ),
    )
    .limit(1)
  if (!row) return null
  return withStats(row, await statsFor(db, { orgId, viewer, ids: [row.id] }))
}

export { createCustomer }

/**
 * Edita un cliente de la bodega. Devuelve false si no existe en ESA bodega (nunca toca filas de
 * otra). Un documento repetido lanza `DuplicateDocumentError`.
 */
export async function updateCustomer(
  db: Db,
  { orgId, role, id, input }: { orgId: string; role: string; id: string; input: CustomerInput },
): Promise<boolean> {
  try {
    const rows = await db
      .update(customer)
      .set({
        name: normalizeDisplayName(input.name),
        nameKey: nameKey(input.name),
        documentType: input.documentType,
        documentNumber: input.documentNumber,
        phone: input.phone,
        email: input.email,
        address: input.address,
      })
      .where(
        and(
          eq(customer.id, id),
          eq(customer.organizationId, orgId),
          // Sin customer:delete (cajero) solo se editan clientes activos
          can(role, { customer: ['delete'] }) ? undefined : eq(customer.active, true),
        ),
      )
      .returning({ id: customer.id })
    return rows.length > 0
  } catch (e) {
    return rethrowCustomerError(e)
  }
}

/** "Eliminar" = desactivar. Los clientes no se borran (hay ventas que los referencian). */
export async function setCustomerActive(
  db: Db,
  { orgId, id, active }: { orgId: string; id: string; active: boolean },
): Promise<boolean> {
  const rows = await db
    .update(customer)
    .set({ active })
    .where(and(eq(customer.id, id), eq(customer.organizationId, orgId)))
    .returning({ id: customer.id })
  return rows.length > 0
}

/**
 * Historial de compras del cliente (todos los estados, la más reciente primero). Un cajero solo ve
 * las ventas que cobró él. Devuelve [] si el cliente es de otra bodega.
 */
export async function listCustomerSales(
  db: Db,
  {
    orgId,
    viewer,
    customerId,
    page = 1,
  }: { orgId: string; viewer: Viewer; customerId: string; page?: number },
): Promise<{ rows: CustomerSaleRow[]; page: number; hasNext: boolean }> {
  const p = Number.isInteger(page) && page >= 1 ? page : 1
  const rows = await db
    .select({
      id: sale.id,
      series: sale.series,
      number: sale.number,
      createdAt: sale.createdAt,
      paymentMethod: sale.paymentMethod,
      totalCents: sale.totalCents,
      status: sale.status,
      cashierName: user.name,
    })
    .from(sale)
    .leftJoin(user, eq(user.id, sale.cashierId))
    .where(and(eq(sale.organizationId, orgId), eq(sale.customerId, customerId), saleScope(viewer)))
    .orderBy(desc(sale.createdAt), desc(sale.id))
    .limit(PAGE_SIZE + 1)
    .offset((p - 1) * PAGE_SIZE)

  return {
    rows: rows.slice(0, PAGE_SIZE).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    page: p,
    hasNext: rows.length > PAGE_SIZE,
  }
}

export type ExportResult = { rows: CustomerExportRow[]; truncated: boolean }

/**
 * Clientes filtrados (con inactivos si se pide) para el CSV, tope 5000. Los importes de compras
 * se calculan como los ve `viewer`: la ruta solo lo llama para quien ve todas las ventas.
 */
export async function exportRows(
  db: Db,
  {
    orgId,
    viewer,
    query = '',
    includeInactive = false,
  }: { orgId: string; viewer: Viewer; query?: string; includeInactive?: boolean },
): Promise<ExportResult> {
  const found = await db
    .select(columns)
    .from(customer)
    .where(
      and(
        eq(customer.organizationId, orgId),
        includeInactive ? undefined : eq(customer.active, true),
        customerSearchCondition(query),
      ),
    )
    .orderBy(asc(customer.nameKey), asc(customer.id))
    .limit(EXPORT_LIMIT + 1)

  const truncated = found.length > EXPORT_LIMIT
  const customers = found.slice(0, EXPORT_LIMIT)
  const stats = await statsFor(db, { orgId, viewer, ids: customers.map((c) => c.id) })
  return {
    truncated,
    rows: customers.map((c) => {
      const { createdAt: _createdAt, id: _id, ...row } = withStats(c, stats)
      return row
    }),
  }
}
