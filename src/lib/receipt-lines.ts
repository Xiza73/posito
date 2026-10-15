import { formatCents } from '@/lib/format'
import { PAYMENT_LABELS, type PaymentMethod } from '@/lib/payment'
import { formatReceiptNumber } from '@/lib/receipt'

/** Mismos valores que el enum `sale_status` de la DB. */
export type SaleStatus = 'completada' | 'anulada'

/**
 * Venta tal como la devuelve el servidor (serializable: sin Date). El estado SIEMPRE sale de la
 * DB: el cliente nunca decide si una boleta está anulada.
 */
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
  status: SaleStatus
  /** ISO 8601; solo si `status === 'anulada'`. */
  voidedAt: string | null
  voidReason: string | null
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

/** Marca visible de una boleta anulada: sello, fecha y motivo. Vacío si la venta sigue vigente. */
function voidedLines(sale: SaleSummary): ReceiptLine[] {
  if (sale.status !== 'anulada') return []
  const out: ReceiptLine[] = [
    { kind: 'gap' },
    { kind: 'center', text: '*** ANULADA ***', bold: true, large: true },
  ]
  if (sale.voidedAt) out.push({ kind: 'center', text: formatReceiptDate(sale.voidedAt) })
  if (sale.voidReason) out.push({ kind: 'center', text: `Motivo: ${sale.voidReason}` })
  return out
}

export function receiptLines(sale: SaleSummary, businessName: string): ReceiptLine[] {
  const out: ReceiptLine[] = [
    { kind: 'center', text: businessName.toUpperCase(), bold: true, large: true },
    { kind: 'center', text: receiptTitle(sale) },
    { kind: 'center', text: formatReceiptDate(sale.createdAt) },
    ...voidedLines(sale),
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
  out.push({ kind: 'gap' })
  out.push(
    sale.status === 'anulada'
      ? { kind: 'center', text: 'Documento sin validez: venta anulada' }
      : { kind: 'center', text: 'Gracias por su compra' },
  )
  return out
}
