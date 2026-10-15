import { formatLimaDateTime } from '@/lib/lima-time'
import { PAYMENT_LABELS, type PaymentMethod } from '@/lib/payment'
import { formatReceiptNumber } from '@/lib/receipt'

/** Fila de exportación: una venta con sus líneas (serializable, sin Date). */
export type ExportRow = {
  series: string
  number: number
  /** ISO 8601 */
  createdAt: string
  cashierName: string | null
  paymentMethod: PaymentMethod
  status: 'completada' | 'anulada'
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

const BOM = '﻿'

/** Céntimos enteros -> "9.10", con aritmética entera (sin floats). */
export function centsToDecimal(cents: number): string {
  const abs = Math.abs(cents)
  const sign = cents < 0 ? '-' : ''
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * Inyección de fórmulas (CSV injection): Excel/Sheets ejecutan como fórmula una celda que empieza
 * con = + - @ (o tab / retorno de carro). Se antepone `'` para que se lea como texto.
 * Aplica a TODO texto que venga de usuarios (nombres de producto, cajero, motivo).
 */
const FORMULA_START = /^[=+\-@\t\r]/

/** RFC 4180: se entrecomilla si hay coma, comilla o salto de línea; las comillas se duplican. */
export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

const STATUS_LABELS = { completada: 'Completada', anulada: 'Anulada' } as const

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

/** CSV UTF-8 con BOM (Excel lo abre con tildes), separador coma y saltos CRLF. */
export function toCsv(rows: ExportRow[]): string {
  const lines = [CSV_HEADERS as readonly string[], ...rows.map(rowCells)]
  return `${BOM}${lines.map((cells) => cells.map(csvCell).join(',')).join('\r\n')}\r\n`
}
