import { and, asc, eq, ilike, or, type SQL } from 'drizzle-orm'
import { customer } from '@/db/schema'
import {
  type CustomerInput,
  type CustomerOption,
  DUPLICATE_DOCUMENT_MESSAGE,
} from './customer-input'
import type { Db } from './db-types'
import { normalizeDocument } from './document'
import { uniqueViolation } from './errors'
import { nameKey, normalizeDisplayName } from './name-key'

// Acceso a clientes compartido por Clientes y la Caja (las features no se importan entre sí).
// `orgId` sale SIEMPRE de la sesión (getCurrentMember), nunca del cliente.

export class DuplicateDocumentError extends Error {
  constructor() {
    super(DUPLICATE_DOCUMENT_MESSAGE)
    this.name = 'DuplicateDocumentError'
  }
}

/** Convierte la violación de unicidad del documento en un error con mensaje para el usuario. */
export function rethrowCustomerError(e: unknown): never {
  if (uniqueViolation(e) === 'customer_org_document_uq') throw new DuplicateDocumentError()
  throw e
}

/** Escapa los comodines de LIKE para que la búsqueda sea literal. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, '\\$&')

/**
 * Condición de búsqueda: por nombre (sin mayúsculas ni tildes, vía `name_key`) o por documento
 * (prefijo del número normalizado; solo si lo escrito tiene algún dígito, para que "ana" no
 * coincida con un CE que empieza con "ANA"). Vacío = sin condición.
 */
export function customerSearchCondition(query: string): SQL | undefined {
  const q = query.trim()
  if (!q) return undefined
  const byName = ilike(customer.nameKey, `%${escapeLike(nameKey(q))}%`)
  const doc = normalizeDocument(q)
  if (!/\d/.test(doc) || !/^[A-Z0-9]+$/.test(doc)) return byName
  return or(byName, ilike(customer.documentNumber, `${escapeLike(doc)}%`))
}

const optionColumns = {
  id: customer.id,
  name: customer.name,
  documentType: customer.documentType,
  documentNumber: customer.documentNumber,
  phone: customer.phone,
}

/** Clientes ACTIVOS que coinciden (para el selector de la Caja). */
export async function searchActiveCustomers(
  db: Db,
  { orgId, query, limit = 8 }: { orgId: string; query: string; limit?: number },
): Promise<CustomerOption[]> {
  return db
    .select(optionColumns)
    .from(customer)
    .where(
      and(
        eq(customer.organizationId, orgId),
        eq(customer.active, true),
        customerSearchCondition(query),
      ),
    )
    .orderBy(asc(customer.nameKey), asc(customer.id))
    .limit(limit)
}

/** Alta de cliente. Un documento repetido en la bodega lanza `DuplicateDocumentError`. */
export async function createCustomer(
  db: Db,
  { orgId, input }: { orgId: string; input: CustomerInput },
): Promise<CustomerOption> {
  try {
    const [created] = await db
      .insert(customer)
      .values({
        organizationId: orgId,
        name: normalizeDisplayName(input.name),
        nameKey: nameKey(input.name),
        documentType: input.documentType,
        documentNumber: input.documentNumber,
        phone: input.phone,
        email: input.email,
        address: input.address,
      })
      .returning(optionColumns)
    return created
  } catch (e) {
    return rethrowCustomerError(e)
  }
}
