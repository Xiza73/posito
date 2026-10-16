import { buildCsv, centsToDecimal } from '@/lib/csv'
import { formatLimaDateTime } from '@/lib/lima-time'
import { PAYMENT_LABELS, type PaymentMethod } from '@/lib/payment'
import { formatReceiptNumber } from '@/lib/receipt'
import type { SaleStatus } from '@/lib/receipt-lines'

/** Fila de exportación: una venta con sus líneas (serializable, sin Date). */
export type ExportRow = {
  series: string
  number: number
  /** ISO 8601 */
  createdAt: string
  cashierName: string | null
  paymentMethod: PaymentMethod
  status: SaleStatus
  subtotalCents: number
  igvCents: number
  totalCents: number
  items: { name: string; qty: number }[]
  voidReason: string | null
}

export const CSV_HEADERS = [
  'Boleta',
  'Fecha',
  'Cajero',
  'Método',
  'Estado',
  'Subtotal',
  'IGV',
  'Total',
  'Productos',
  'Motivo anulación',
] as const

const STATUS_LABELS = {
  completada: 'Completada',
  anulada: 'Anulada',
  pendiente: 'Por validar',
} as const satisfies Record<SaleStatus, string>

function rowCells(r: ExportRow): string[] {
  return [
    formatReceiptNumber(r.series, r.number),
    formatLimaDateTime(r.createdAt),
    r.cashierName ?? '',
    PAYMENT_LABELS[r.paymentMethod],
    STATUS_LABELS[r.status],
    centsToDecimal(r.subtotalCents),
    centsToDecimal(r.igvCents),
    centsToDecimal(r.totalCents),
    // ' | ' y no ';': un Excel con separador ';' partiría la celda y dejaría una fórmula suelta
    r.items.map((i) => `${i.qty}x ${i.name}`).join(' | '),
    r.voidReason ?? '',
  ]
}

export function toCsv(rows: ExportRow[]): string {
  return buildCsv([CSV_HEADERS, ...rows.map(rowCells)])
}
