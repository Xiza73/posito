import { formatCents } from '@/lib/format'
import { type PriceTier, unitPriceFor } from '@/lib/pricing'

// Arma el mensaje de pedido de la tienda online y el enlace wa.me. Función PURA: nada se guarda en
// el servidor, el cliente abre WhatsApp con el texto ya escrito. Los precios se recalculan aquí con
// los niveles del catálogo (nunca con precios guardados en el navegador).

export const ORDER_LIMITS = {
  name: 80,
  address: 200,
  reference: 150,
  station: 80,
  note: 300,
} as const
/** Un wa.me largo falla en algunos clientes: tope práctico para el mensaje YA codificado. */
export const MAX_ENCODED_MESSAGE = 1800
export const MAX_CART_LINES = 50
export const MAX_LINE_QTY = 999

export type OrderMode = 'recojo' | 'delivery' | 'metro'

export const MODE_LABEL: Record<OrderMode, string> = {
  recojo: 'Recojo en tienda',
  delivery: 'Delivery',
  metro: 'Estación del Metropolitano',
}

/** Delivery: el envío se confirma por WhatsApp, así que el total real es "+ envío". */
export const shippingLabel = (mode: OrderMode) => (mode === 'delivery' ? 'A confirmar' : 'Gratis')

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
  /** Referencia de la dirección (delivery). */
  reference?: string
  /** Estación (modalidad metro). */
  station?: string
  note?: string
}

const CONTROL_OR_FORMAT = /[\p{Cc}\p{Cf}]/gu
// Marcas de formato de WhatsApp: un cliente no debe poder "dar formato" al mensaje del negocio
const WA_MARKUP = /[*_~`]/g

/** Texto libre del cliente: sin control/formato/markup de WhatsApp, espacios colapsados y con tope. */
export function sanitizeText(value: string, max: number): string {
  const cleaned = value
    .replace(CONTROL_OR_FORMAT, ' ')
    .replace(WA_MARKUP, '')
    .replace(/\s+/g, ' ')
    .trim()
  // Por code points: un .slice() podría partir un par sustituto y encodeURIComponent lanzaría URIError
  return cutCodePoints(cleaned, max).trim()
}

/** Primeros `max` code points (nunca parte un par sustituto). */
const cutCodePoints = (value: string, max: number) => Array.from(value).slice(0, max).join('')

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

  const name = sanitizeText(storeName, 80)
  const customerName = sanitizeText(customer.name, ORDER_LIMITS.name)
  // Campos de texto libre: si el encabezado no cabe, se acortan (nota, referencia, dirección)
  const fields = {
    address:
      customer.mode === 'delivery'
        ? sanitizeText(customer.address ?? '', ORDER_LIMITS.address)
        : '',
    reference:
      customer.mode === 'delivery'
        ? sanitizeText(customer.reference ?? '', ORDER_LIMITS.reference)
        : '',
    note: sanitizeText(customer.note ?? '', ORDER_LIMITS.note),
  }
  const station =
    customer.mode === 'metro' ? sanitizeText(customer.station ?? '', ORDER_LIMITS.station) : ''

  const foot = [
    '',
    `Envío: ${shippingLabel(customer.mode).toLowerCase()}`,
    `Total: ${formatCents(totalCents)}${customer.mode === 'delivery' ? ' + envío' : ''}`,
  ]

  const compose = (shown: number) => {
    const head = [
      `Hola, quiero hacer un pedido en ${name}.`,
      '',
      `Cliente: ${customerName}`,
      `Modalidad: ${MODE_LABEL[customer.mode]}`,
    ]
    if (fields.address) head.push(`Dirección: ${fields.address}`)
    if (fields.reference) head.push(`Referencia: ${fields.reference}`)
    if (customer.mode === 'metro') {
      if (station) head.push(`Estación: ${station}`)
      head.push('Coordinar día y hora de entrega')
    }
    if (fields.note) head.push(`Nota: ${fields.note}`)
    head.push('', 'Productos:')
    const items = priced.slice(0, shown).map(lineText)
    const hidden = priced.length - shown
    if (hidden > 0) items.push(`…y ${hidden} ${hidden === 1 ? 'producto más' : 'productos más'}`)
    return [...head, ...items, ...foot].join('\n')
  }
  const tooLong = (text: string) => encodeURIComponent(text).length > maxEncoded

  // 1) Se acorta la lista de productos, pero siempre queda al menos 1 línea
  const minShown = Math.min(1, priced.length)
  let shown = priced.length
  let text = compose(shown)
  while (shown > minShown && tooLong(text)) {
    shown -= 1
    text = compose(shown)
  }
  // 2) Si aún no cabe: se acortan nota -> referencia -> dirección (de 10 en 10 code points).
  //    El total siempre se conserva; si ni vaciando los campos cabe, se acepta pasarse (1 línea mínima).
  for (const key of ['note', 'reference', 'address'] as const) {
    while (tooLong(text) && fields[key]) {
      fields[key] = cutCodePoints(
        fields[key],
        Math.max(0, Array.from(fields[key]).length - 10),
      ).trim()
      text = compose(shown)
    }
  }
  return { text, totalCents, truncated: shown < priced.length }
}

/** `https://wa.me/<51XXXXXXXXX>?text=<mensaje>`; el número ya viene normalizado del servidor. */
export function whatsappUrl(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`
}
