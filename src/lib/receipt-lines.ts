import type { BusinessSnapshot } from '@/lib/business-profile'
import { type DocumentType, formatDocument } from '@/lib/document'
import { formatCents } from '@/lib/format'
import { PAYMENT_LABELS, type PaymentMethod } from '@/lib/payment'
import { formatReceiptNumber } from '@/lib/receipt'

/** Mismos valores que el enum `sale_status` de la DB. */
export type SaleStatus = 'completada' | 'anulada' | 'pendiente'

/** Cliente de la venta, tal como lo guardó el servidor (nunca viene del cliente web). */
export type SaleCustomer = {
  /** null si el cliente ya no existe: el snapshot de la venta se conserva. */
  id: string | null
  name: string
  documentType: DocumentType | null
  documentNumber: string | null
}

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
  /** null = público general. */
  customer: SaleCustomer | null
  status: SaleStatus
  /** ISO 8601; solo si `status === 'anulada'`. */
  voidedAt: string | null
  voidReason: string | null
  /** Datos del negocio al momento del cobro (snapshot): la boleta nunca usa el perfil vivo. */
  business: BusinessSnapshot
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

/** Venta que un administrador aún debe validar: la boleta lo dice (el estado viene del servidor). */
function pendingLines(sale: SaleSummary): ReceiptLine[] {
  if (sale.status !== 'pendiente') return []
  return [{ kind: 'gap' }, { kind: 'center', text: 'VENTA SUJETA A VALIDACIÓN', bold: true }]
}

/** "Cliente: NOMBRE" + "DNI 12345678"; sin cliente, "Cliente: público general". */
function customerLines(sale: SaleSummary): ReceiptLine[] {
  const c = sale.customer
  if (!c) return [{ kind: 'row', left: 'Cliente: público general', right: '' }]
  const out: ReceiptLine[] = [{ kind: 'row', left: `Cliente: ${c.name}`, right: '' }]
  if (c.documentType && c.documentNumber) {
    out.push({ kind: 'row', left: formatDocument(c.documentType, c.documentNumber), right: '' })
  }
  return out
}

/** Encabezado: nombre comercial, razón social + RUC, dirección y teléfono (los que existan). */
function headerLines(b: BusinessSnapshot): ReceiptLine[] {
  const out: ReceiptLine[] = [
    { kind: 'center', text: b.tradeName.toUpperCase(), bold: true, large: true },
  ]
  if (b.legalName) out.push({ kind: 'center', text: b.legalName })
  if (b.ruc) out.push({ kind: 'center', text: `RUC ${b.ruc}` })
  if (b.address) out.push({ kind: 'center', text: b.address })
  if (b.phone) out.push({ kind: 'center', text: `Tel. ${b.phone}` })
  return out
}

export function receiptLines(sale: SaleSummary): ReceiptLine[] {
  const out: ReceiptLine[] = [
    ...headerLines(sale.business),
    { kind: 'center', text: receiptTitle(sale) },
    { kind: 'center', text: formatReceiptDate(sale.createdAt) },
    ...voidedLines(sale),
    ...pendingLines(sale),
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
  out.push(...customerLines(sale))
  out.push({ kind: 'gap' })
  out.push(
    sale.status === 'anulada'
      ? { kind: 'center', text: 'Documento sin validez: venta anulada' }
      : { kind: 'center', text: sale.business.receiptFooter },
  )
  return out
}
