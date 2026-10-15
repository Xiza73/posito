import { formatReceiptNumber } from './receipt'
import { type ReceiptLine, receiptLines, receiptTitle, type SaleSummary } from './receipt-lines'

// ~80 mm a ~180 dpi: la boleta como imagen para compartir (WhatsApp, etc.)
const WIDTH = 576
const PAD = 28
const FONT = 'ui-monospace, "DM Mono", Menlo, Consolas, monospace'
const SIZE = 22
const SIZE_LARGE = 28
const LEADING = 1.35
const GAP_AFTER_RULE = 10

const fontOf = (l: { bold?: boolean; large?: boolean }) =>
  `${l.bold ? '700 ' : ''}${l.large ? SIZE_LARGE : SIZE}px ${FONT}`

/** Parte `text` en renglones que quepan en `maxWidth` (corta por palabras; una palabra larga se corta por letras). */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const attempt = line ? `${line} ${word}` : word
    if (ctx.measureText(attempt).width <= maxWidth) {
      line = attempt
      continue
    }
    if (line) out.push(line)
    line = ''
    let rest = word
    while (ctx.measureText(rest).width > maxWidth && rest.length > 1) {
      let n = rest.length - 1
      while (n > 1 && ctx.measureText(rest.slice(0, n)).width > maxWidth) n--
      out.push(rest.slice(0, n))
      rest = rest.slice(n)
    }
    line = rest
  }
  if (line) out.push(line)
  return out.length > 0 ? out : ['']
}

/** Recorre las líneas; con `paint` también dibuja. Devuelve el alto total en px. */
function layout(ctx: CanvasRenderingContext2D, lines: ReceiptLine[], paint: boolean): number {
  const inner = WIDTH - PAD * 2
  let y = PAD
  for (const l of lines) {
    if (l.kind === 'gap') {
      y += SIZE * LEADING
      continue
    }
    if (l.kind === 'rule') {
      y += GAP_AFTER_RULE
      if (paint) {
        ctx.strokeStyle = '#999'
        ctx.setLineDash([6, 5])
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(PAD, y)
        ctx.lineTo(WIDTH - PAD, y)
        ctx.stroke()
      }
      y += GAP_AFTER_RULE + 2
      continue
    }

    ctx.font = fontOf(l)
    const step = (l.large ? SIZE_LARGE : SIZE) * LEADING
    if (l.kind === 'center') {
      for (const part of wrap(ctx, l.text, inner)) {
        if (paint) {
          ctx.textAlign = 'center'
          ctx.fillText(part, WIDTH / 2, y + step * 0.75)
        }
        y += step
      }
      continue
    }

    // row: texto a la izquierda (puede envolver) y monto a la derecha
    const rightWidth = ctx.measureText(l.right).width
    const leftParts = wrap(ctx, l.left, Math.max(80, inner - rightWidth - 16))
    leftParts.forEach((part, i) => {
      if (!paint) return
      ctx.textAlign = 'left'
      ctx.fillText(part, PAD, y + step * (i + 0.75))
      if (i === 0) {
        ctx.textAlign = 'right'
        ctx.fillText(l.right, WIDTH - PAD, y + step * 0.75)
      }
    })
    y += step * leftParts.length
  }
  return Math.ceil(y + PAD)
}

/** Dibuja la boleta (fondo blanco, texto negro) en un canvas de 576 px de ancho. */
export function drawReceipt(sale: SaleSummary, businessName: string): HTMLCanvasElement {
  const lines = receiptLines(sale, businessName)
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH

  // Primera pasada sin pintar para conocer el alto; cambiar width/height reinicia el contexto
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D no disponible')
  canvas.height = layout(ctx, lines, false)

  const paint = canvas.getContext('2d')
  if (!paint) throw new Error('Canvas 2D no disponible')
  paint.fillStyle = '#fff'
  paint.fillRect(0, 0, WIDTH, canvas.height)
  paint.fillStyle = '#000'
  layout(paint, lines, true)
  return canvas
}

export function receiptFileName(sale: Pick<SaleSummary, 'series' | 'number'>): string {
  return `boleta-${formatReceiptNumber(sale.series, sale.number)}.png`
}

/**
 * Comparte la boleta como PNG con la hoja de compartir del sistema (móvil); si no hay Web Share
 * con archivos (escritorio), la descarga. Cancelar el diálogo de compartir no es un error.
 */
export async function shareReceiptImage(sale: SaleSummary, businessName: string): Promise<void> {
  const canvas = drawReceipt(sale, businessName)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('No se pudo generar la imagen')
  const file = new File([blob], receiptFileName(sale), { type: 'image/png' })

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: receiptTitle(sale) })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      throw e
    }
    return
  }

  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = file.name
  a.click()
  // Revocar de inmediato puede cancelar la descarga en algunos navegadores
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
