import { describe, expect, it } from 'vitest'
import { formatReceiptDate, receiptLines, receiptTitle, type SaleSummary } from './receipt'

const sale: SaleSummary = {
  id: 'x',
  series: 'B001',
  number: 38,
  createdAt: '2026-10-14T18:05:00.000Z', // 13:05 en Lima (UTC-5)
  paymentMethod: 'yape_plin',
  lines: [
    { name: 'Inca Kola 500 ml', qty: 2, unitPriceCents: 300, lineTotalCents: 600 },
    { name: 'Pan francés', qty: 3, unitPriceCents: 30, lineTotalCents: 90 },
  ],
  subtotalCents: 585,
  igvCents: 105,
  totalCents: 690,
  cashierName: 'Ana Rojas',
}

const rows = (lines: ReturnType<typeof receiptLines>) =>
  lines.flatMap((l) => (l.kind === 'row' ? [`${l.left}|${l.right}`] : []))

describe('receiptLines', () => {
  const lines = receiptLines(sale, 'Bodega San Martín')

  it('encabeza con negocio, número y fecha en hora de Lima', () => {
    expect(lines[0]).toMatchObject({ kind: 'center', text: 'BODEGA SAN MARTÍN' })
    expect(lines[1]).toMatchObject({ text: 'Boleta de venta B001-00038' })
    expect(lines[2]).toMatchObject({ kind: 'center' })
    expect((lines[2] as { text: string }).text).toMatch(/14\/10\/2026.*13:05/)
  })

  it('lista cada línea con cantidad × nombre y su total', () => {
    const r = rows(lines)
    expect(r[0]).toMatch(/^2 × Inca Kola 500 ml\|S\/.6\.00$/)
    expect(r[1]).toMatch(/^3 × Pan francés\|S\/.0\.90$/)
  })

  it('incluye subtotal, IGV, total, pago y cajero', () => {
    const r = rows(lines).join('\n')
    expect(r).toMatch(/Subtotal\|S\/.5\.85/)
    expect(r).toMatch(/IGV 18 % \(incluido\)\|S\/.1\.05/)
    expect(r).toMatch(/TOTAL\|S\/.6\.90/)
    expect(r).toContain('Pago|Yape / Plin')
    expect(r).toContain('Cajero/a|Ana Rojas')
  })

  it('cierra con el agradecimiento y omite el cajero si no se conoce', () => {
    const last = receiptLines({ ...sale, cashierName: null }, 'X')
    expect(last.at(-1)).toMatchObject({ text: 'Gracias por su compra' })
    expect(rows(last).join()).not.toContain('Cajero/a')
  })
})

describe('helpers', () => {
  it('formatea fecha y título', () => {
    expect(formatReceiptDate(sale.createdAt)).toMatch(/13:05/)
    expect(receiptTitle(sale)).toBe('Boleta de venta B001-00038')
  })
})
