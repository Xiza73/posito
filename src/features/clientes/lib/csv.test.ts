import { describe, expect, it } from 'vitest'
import { CSV_HEADERS, type CustomerExportRow, toCsv } from './csv'

const row: CustomerExportRow = {
  name: 'Ana Rojas',
  documentType: 'dni',
  documentNumber: '12345678',
  phone: '987 654 321',
  email: 'ana@correo.pe',
  address: 'Av. Lima 123, Miraflores',
  active: true,
  purchaseCount: 3,
  totalSpentCents: 12_345,
  lastPurchaseAt: '2026-10-14T18:05:00.000Z', // 13:05 en Lima
}

const lines = (csv: string) => csv.replace(/^﻿/, '').trimEnd().split('\r\n')

describe('toCsv (clientes)', () => {
  it('lleva BOM y la cabecera acordada', () => {
    const csv = toCsv([])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(lines(csv)[0]).toBe(CSV_HEADERS.join(','))
    expect(CSV_HEADERS).toEqual([
      'Nombre',
      'Tipo doc',
      'Documento',
      'Teléfono',
      'Email',
      'Dirección',
      'Activo',
      'Compras',
      'Total gastado',
      'Última compra',
    ])
  })

  it('exporta importes con aritmética entera y la fecha en hora de Lima', () => {
    expect(lines(toCsv([row]))[1]).toBe(
      'Ana Rojas,DNI,12345678,987 654 321,ana@correo.pe,"Av. Lima 123, Miraflores",Sí,3,123.45,2026-10-14 13:05',
    )
  })

  it('cliente sin documento ni compras, inactivo', () => {
    const csv = toCsv([
      {
        ...row,
        documentType: null,
        documentNumber: null,
        phone: null,
        email: null,
        address: null,
        active: false,
        purchaseCount: 0,
        totalSpentCents: 0,
        lastPurchaseAt: null,
      },
    ])
    expect(lines(csv)[1]).toBe('Ana Rojas,,,,,,No,0,0.00,')
  })

  it('protege contra inyección de fórmulas en todo texto del usuario', () => {
    const csv = toCsv([
      {
        ...row,
        name: '=HYPERLINK("http://x")',
        phone: '+51 999 888 777',
        email: '@cmd',
        address: '-2+3',
      },
    ])
    const out = lines(csv)[1]
    expect(out).toContain('"\'=HYPERLINK(""http://x"")"')
    expect(out).toContain(",'+51 999 888 777,")
    expect(out).toContain(",'@cmd,")
    expect(out).toContain(",'-2+3,")
  })
})
