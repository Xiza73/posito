import { buildCsv, centsToDecimal } from '@/lib/csv'
import { DOCUMENT_LABELS, type DocumentType } from '@/lib/document'
import { formatLimaDateTime } from '@/lib/lima-time'

/** Fila de exportación: un cliente con sus compras completadas (serializable, sin Date). */
export type CustomerExportRow = {
  name: string
  documentType: DocumentType | null
  documentNumber: string | null
  phone: string | null
  email: string | null
  address: string | null
  active: boolean
  purchaseCount: number
  totalSpentCents: number
  /** ISO 8601 */
  lastPurchaseAt: string | null
}

export const CSV_HEADERS = [
  'Nombre',
  'Tipo doc',
  'Documento',
  'Teléfono',
  'Email',
  'Dirección',
  'Activo',
  'Compras',
  'Total gastado',
  'Última compra',
] as const

function rowCells(r: CustomerExportRow): string[] {
  return [
    r.name,
    r.documentType ? DOCUMENT_LABELS[r.documentType] : '',
    r.documentNumber ?? '',
    r.phone ?? '',
    r.email ?? '',
    r.address ?? '',
    r.active ? 'Sí' : 'No',
    String(r.purchaseCount),
    centsToDecimal(r.totalSpentCents),
    r.lastPurchaseAt ? formatLimaDateTime(r.lastPurchaseAt) : '',
  ]
}

/** Toda celda de texto del usuario pasa por `csvCell` (inyección de fórmulas) dentro de buildCsv. */
export function toCsv(rows: CustomerExportRow[]): string {
  return buildCsv([CSV_HEADERS, ...rows.map(rowCells)])
}
