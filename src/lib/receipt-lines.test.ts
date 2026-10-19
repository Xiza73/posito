import { describe, expect, it } from 'vitest'
import { formatReceiptDate, receiptLines, receiptTitle, type SaleSummary } from './receipt-lines'

const sale: SaleSummary = {
  id: 'x',
  series: 'B001',
  number: 38,
  createdAt: '2026-10-14T18:05:00.000Z', // 13:05 en Lima (UTC-5)
  paymentMethod: 'yape_plin',
  lines: [
    {
      name: 'Inca Kola 500 ml',
      qty: 2,
      unitPriceCents: 300,
      listUnitPriceCents: 300,
      priceSource: 'normal',
      lineTotalCents: 600,
    },
    {
      name: 'Pan francés',
      qty: 3,
      unitPriceCents: 30,
      listUnitPriceCents: 30,
      priceSource: 'normal',
      lineTotalCents: 90,
    },
  ],
  subtotalCents: 585,
  igvCents: 105,
  totalCents: 690,
  cashierName: 'Ana Rojas',
  customer: null,
  status: 'completada',
  voidedAt: null,
  voidReason: null,
  business: {
    version: 1,
    tradeName: 'Bodega San Martín',
    legalName: null,
    ruc: null,
    address: null,
    phone: null,
    branchName: null,
    receiptFooter: 'Gracias por su compra',
  },
}

const rows = (lines: ReturnType<typeof receiptLines>) =>
  lines.flatMap((l) => (l.kind === 'row' ? [`${l.left}|${l.right}`] : []))

describe('receiptLines', () => {
  const lines = receiptLines(sale)

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

  it('una línea normal no muestra detalle de precio por mayor', () => {
    expect(rows(lines).join('\n')).not.toMatch(/por mayor/)
  })

  it('una línea por mayor agrega "N × precio (por mayor)" justo debajo, con el total correcto', () => {
    const mayor: SaleSummary = {
      ...sale,
      lines: [
        {
          name: 'Inca Kola 500 ml',
          qty: 8,
          unitPriceCents: 250,
          listUnitPriceCents: 300,
          priceSource: 'mayor',
          lineTotalCents: 2000,
        },
      ],
    }
    const r = rows(receiptLines(mayor))
    expect(r[0]).toMatch(/^8 × Inca Kola 500 ml\|S\/.20\.00$/)
    expect(r[1]).toMatch(/^ {2}8 × S\/.2\.50 \(por mayor\)\|$/)
  })

  it('una línea con precio editado imprime solo el importe final (sin exponer el descuento)', () => {
    const manual: SaleSummary = {
      ...sale,
      lines: [
        {
          name: 'Inca Kola 500 ml',
          qty: 3,
          unitPriceCents: 333,
          listUnitPriceCents: 300,
          priceSource: 'manual',
          lineTotalCents: 1000,
        },
      ],
    }
    const r = rows(receiptLines(manual))
    expect(r[0]).toMatch(/^3 × Inca Kola 500 ml\|S\/.10\.00$/)
    expect(r[1]).toMatch(/^Subtotal/)
    expect(r.join('\n')).not.toMatch(/editado|mayor|3\.33|manual/i)
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
    const last = receiptLines({ ...sale, cashierName: null })
    expect(last.at(-1)).toMatchObject({ text: 'Gracias por su compra' })
    expect(rows(last).join()).not.toContain('Cajero/a')
  })
})

describe('receiptLines: cliente', () => {
  it('sin cliente dice "público general"', () => {
    const r = rows(receiptLines(sale))
    expect(r).toContain('Cliente: público general|')
    expect(r.some((l) => /^(DNI|RUC|CE) /.test(l))).toBe(false)
  })

  it('con DNI muestra el nombre y el documento', () => {
    const r = rows(
      receiptLines({
        ...sale,
        customer: {
          id: 'c1',
          name: 'Juan Pérez',
          documentType: 'dni',
          documentNumber: '12345678',
        },
      }),
    )
    expect(r).toContain('Cliente: Juan Pérez|')
    expect(r).toContain('DNI 12345678|')
    expect(r).not.toContain('Cliente: público general|')
  })

  it('con RUC muestra el RUC', () => {
    const r = rows(
      receiptLines({
        ...sale,
        customer: {
          id: 'c2',
          name: 'Distribuidora SAC',
          documentType: 'ruc',
          documentNumber: '20100047218',
        },
      }),
    )
    expect(r).toContain('RUC 20100047218|')
  })

  it('un cliente sin documento muestra solo el nombre', () => {
    const r = rows(
      receiptLines({
        ...sale,
        customer: { id: 'c3', name: 'Doña Rosa', documentType: null, documentNumber: null },
      }),
    )
    expect(r).toContain('Cliente: Doña Rosa|')
    expect(r.some((l) => /^(DNI|RUC|CE) /.test(l))).toBe(false)
  })
})

describe('receiptLines: venta anulada', () => {
  const voided: SaleSummary = {
    ...sale,
    status: 'anulada',
    voidedAt: '2026-10-15T15:30:00.000Z', // 10:30 en Lima
    voidReason: 'Error de cobro',
  }
  const text = receiptLines(voided).flatMap((l) => (l.kind === 'center' ? [l.text] : []))

  it('muestra el sello ANULADA, la fecha de anulación y el motivo', () => {
    expect(text.join(' ')).toContain('ANULADA')
    expect(text.some((t) => /15\/10\/2026.*10:30/.test(t))).toBe(true)
    expect(text).toContain('Motivo: Error de cobro')
  })

  it('no agradece la compra: aclara que el documento no tiene validez', () => {
    expect(text).not.toContain('Gracias por su compra')
    expect(text.at(-1)).toMatch(/anulada/)
  })

  it('una venta vigente no lleva marca de anulación', () => {
    const ok = receiptLines(sale).flatMap((l) => (l.kind === 'center' ? [l.text] : []))
    expect(ok.join(' ')).not.toMatch(/ANULADA|Motivo/)
  })

  it('omite el motivo si no hay', () => {
    const t = receiptLines({ ...voided, voidReason: null }).flatMap((l) =>
      l.kind === 'center' ? [l.text] : [],
    )
    expect(t.join(' ')).not.toContain('Motivo')
  })
})

describe('helpers', () => {
  it('formatea fecha y título', () => {
    expect(formatReceiptDate(sale.createdAt)).toMatch(/13:05/)
    expect(receiptTitle(sale)).toBe('Boleta de venta B001-00038')
  })
})

describe('receiptLines: venta pendiente de validación', () => {
  const pending: SaleSummary = { ...sale, status: 'pendiente' }
  const centers = (s: SaleSummary) =>
    receiptLines(s).flatMap((l) => (l.kind === 'center' ? [l.text] : []))

  it('lleva la leyenda "VENTA SUJETA A VALIDACIÓN" y sigue siendo un documento válido', () => {
    const text = centers(pending)
    expect(text).toContain('VENTA SUJETA A VALIDACIÓN')
    expect(text).not.toContain('*** ANULADA ***')
    expect(text).toContain('Gracias por su compra')
  })

  it('una venta completada no lleva la leyenda', () => {
    expect(centers(sale)).not.toContain('VENTA SUJETA A VALIDACIÓN')
  })

  it('al rechazarla (anulada) muestra ANULADA y no la leyenda de validación', () => {
    const text = centers({ ...pending, status: 'anulada', voidedAt: '2026-10-14T19:00:00.000Z' })
    expect(text).toContain('*** ANULADA ***')
    expect(text).not.toContain('VENTA SUJETA A VALIDACIÓN')
  })
})

describe('receiptLines: datos del negocio', () => {
  const centers = (s: SaleSummary) =>
    receiptLines(s).flatMap((l) => (l.kind === 'center' ? [l.text] : []))
  const full: SaleSummary = {
    ...sale,
    business: {
      version: 1,
      tradeName: 'Bodega San Martín',
      legalName: 'Inversiones San Martín S.A.C.',
      ruc: '20100047218',
      address: 'Av. Lima 123, Miraflores',
      phone: '987 654 321',
      branchName: 'Sede Centro',
      receiptFooter: 'Vuelva pronto',
    },
  }

  it('encabeza con nombre comercial en negrita, razón social, RUC, dirección y teléfono', () => {
    const lines = receiptLines(full)
    expect(lines[0]).toMatchObject({ text: 'BODEGA SAN MARTÍN', bold: true, large: true })
    expect(centers(full).slice(0, 5)).toEqual([
      'BODEGA SAN MARTÍN',
      'Inversiones San Martín S.A.C.',
      'RUC 20100047218',
      'Av. Lima 123, Miraflores',
      'Tel. 987 654 321',
    ])
  })

  it('el pie es el mensaje configurado', () => {
    expect(centers(full).at(-1)).toBe('Vuelva pronto')
  })

  it('con encabezado parcial omite lo que falta', () => {
    const partial: SaleSummary = {
      ...sale,
      business: { ...sale.business, address: 'Jr. Unión 45' },
    }
    const t = centers(partial)
    expect(t.slice(0, 2)).toEqual(['BODEGA SAN MARTÍN', 'Jr. Unión 45'])
    expect(t.join(' ')).not.toMatch(/RUC|Tel\./)
  })
})
