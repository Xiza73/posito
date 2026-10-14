import { formatCents } from '@/lib/format'
import { formatReceiptNumber } from '@/lib/receipt'
import { PAYMENT_LABELS, type PaymentMethod } from './payment'

/** Venta ya cobrada, tal como la devuelve el servidor (serializable: sin Date). */
export type SaleSummary = {
  id: string
  series: string
  number: number
  /** ISO 8601 */
  createdAt: string
  paymentMethod: PaymentMethod
  lines: { name: string; qty: number; unitPriceCents: number; lineTotalCents: number }[]
  subtotalCents: number
  igvCents: number
  totalCents: number
  cashierName: string | null
}

/** Texto de la boleta como datos: lo usan el modal (DOM) y la imagen (canvas). */
export type ReceiptLine =
  | { kind: 'center'; text: string; bold?: boolean; large?: boolean }
  | { kind: 'row'; left: string; right: string; bold?: boolean; large?: boolean }
  | { kind: 'rule' }
  | { kind: 'gap' }

const dateTime = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Lima',
})

/** "14/10/2026, 13:05" en hora de Lima. */
export function formatReceiptDate(iso: string): string {
  return dateTime.format(new Date(iso))
}

export function receiptTitle(sale: Pick<SaleSummary, 'series' | 'number'>): string {
  return `Boleta de venta ${formatReceiptNumber(sale.series, sale.number)}`
}

export function receiptLines(sale: SaleSummary, businessName: string): ReceiptLine[] {
  const out: ReceiptLine[] = [
    { kind: 'center', text: businessName.toUpperCase(), bold: true, large: true },
    { kind: 'center', text: receiptTitle(sale) },
    { kind: 'center', text: formatReceiptDate(sale.createdAt) },
    { kind: 'rule' },
  ]
  for (const l of sale.lines) {
    out.push({ kind: 'row', left: `${l.qty} × ${l.name}`, right: formatCents(l.lineTotalCents) })
  }
  out.push(
    { kind: 'rule' },
    { kind: 'row', left: 'Subtotal', right: formatCents(sale.subtotalCents) },
    { kind: 'row', left: 'IGV 18 % (incluido)', right: formatCents(sale.igvCents) },
    { kind: 'row', left: 'TOTAL', right: formatCents(sale.totalCents), bold: true, large: true },
    { kind: 'rule' },
    { kind: 'row', left: 'Pago', right: PAYMENT_LABELS[sale.paymentMethod] },
  )
  if (sale.cashierName) out.push({ kind: 'row', left: 'Cajero/a', right: sale.cashierName })
  out.push({ kind: 'gap' }, { kind: 'center', text: 'Gracias por su compra' })
  return out
}
