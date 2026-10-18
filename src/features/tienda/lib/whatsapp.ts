import { formatCents } from '@/lib/format'
import { type PriceTier, unitPriceFor } from '@/lib/pricing'

// Arma el mensaje de pedido de la tienda online y el enlace wa.me. Función PURA: nada se guarda en
// el servidor, el cliente abre WhatsApp con el texto ya escrito. Los precios se recalculan aquí con
// los niveles del catálogo (nunca con precios guardados en el navegador).

export const ORDER_LIMITS = { name: 80, address: 200, note: 300 } as const
/** Un wa.me largo falla en algunos clientes: tope práctico para el mensaje YA codificado. */
export const MAX_ENCODED_MESSAGE = 1800
export const MAX_CART_LINES = 50
export const MAX_LINE_QTY = 999

export type OrderMode = 'recojo' | 'delivery'

export type OrderLine = {
  name: string
  qty: number
  basePriceCents: number
  tiers: readonly PriceTier[]
}

export type OrderCustomer = {
  name: string
  mode: OrderMode
  /** Obligatoria en delivery. */
  address?: string
  note?: string
}

const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/gu
// Marcas de formato de WhatsApp: un cliente no debe poder "dar formato" al mensaje del negocio
const WA_MARKUP = /[*_~`]/g

/** Texto libre del cliente: sin control/formato/markup de WhatsApp, espacios colapsados y con tope. */
export function sanitizeText(value: string, max: number): string {
  return value
    .replace(CONTROL_OR_FORMAT, ' ')
    .replace(WA_MARKUP, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim()
}

export const clampQty = (qty: number) =>
  Number.isFinite(qty) ? Math.min(MAX_LINE_QTY, Math.max(1, Math.trunc(qty))) : 1

export type PricedLine = OrderLine & {
  unitPriceCents: number
  lineTotalCents: number
  wholesale: boolean
}

export function priceLine(line: OrderLine): PricedLine {
  const qty = clampQty(line.qty)
  const price = unitPriceFor({ basePriceCents: line.basePriceCents, tiers: line.tiers }, qty)
  return {
    ...line,
    qty,
    unitPriceCents: price.unitPriceCents,
    lineTotalCents: price.unitPriceCents * qty,
    wholesale: price.source === 'mayor',
  }
}

export const orderTotalCents = (lines: readonly OrderLine[]) =>
  lines.slice(0, MAX_CART_LINES).reduce((sum, l) => sum + priceLine(l).lineTotalCents, 0)

function lineText(l: PricedLine): string {
  const unit = `${formatCents(l.unitPriceCents)} c/u${l.wholesale ? ' (por mayor)' : ''}`
  return `• ${l.qty} x ${sanitizeText(l.name, 120)} - ${unit} = ${formatCents(l.lineTotalCents)}`
}

export type OrderMessage = {
  text: string
  /** Total del pedido (siempre completo, aunque la lista se acorte). */
  totalCents: number
  /** La lista de productos se acortó para caber en el enlace. */
  truncated: boolean
}

export function buildOrderMessage({
  storeName,
  lines,
  customer,
  maxEncoded = MAX_ENCODED_MESSAGE,
}: {
  storeName: string
  lines: readonly OrderLine[]
  customer: OrderCustomer
  maxEncoded?: number
}): OrderMessage {
  const priced = lines.slice(0, MAX_CART_LINES).map(priceLine)
  const totalCents = priced.reduce((sum, l) => sum + l.lineTotalCents, 0)

  const head = [
    `Hola, quiero hacer un pedido en ${sanitizeText(storeName, 80)}.`,
    '',
    `Cliente: ${sanitizeText(customer.name, ORDER_LIMITS.name)}`,
    customer.mode === 'delivery' ? 'Modalidad: Delivery' : 'Modalidad: Recojo en tienda',
  ]
  const address = sanitizeText(customer.address ?? '', ORDER_LIMITS.address)
  if (customer.mode === 'delivery' && address) head.push(`Dirección: ${address}`)
  const note = sanitizeText(customer.note ?? '', ORDER_LIMITS.note)
  if (note) head.push(`Nota: ${note}`)
  head.push('', 'Productos:')

  const foot = ['', `Total: ${formatCents(totalCents)}`]

  const compose = (shown: number) => {
    const items = priced.slice(0, shown).map(lineText)
    const hidden = priced.length - shown
    if (hidden > 0) items.push(`…y ${hidden} ${hidden === 1 ? 'producto más' : 'productos más'}`)
    return [...head, ...items, ...foot].join('\n')
  }

  let shown = priced.length
  let text = compose(shown)
  while (shown > 0 && encodeURIComponent(text).length > maxEncoded) {
    shown -= 1
    text = compose(shown)
  }
  return { text, totalCents, truncated: shown < priced.length }
}

/** `https://wa.me/<51XXXXXXXXX>?text=<mensaje>`; el número ya viene normalizado del servidor. */
export function whatsappUrl(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}
