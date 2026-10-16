import { describe, expect, it } from 'vitest'
import { buildCsv, centsToDecimal, csvCell } from './csv'

describe('centsToDecimal', () => {
  it('formatea con dos decimales usando enteros', () => {
    expect(centsToDecimal(910)).toBe('9.10')
    expect(centsToDecimal(5)).toBe('0.05')
    expect(centsToDecimal(0)).toBe('0.00')
    expect(centsToDecimal(100)).toBe('1.00')
    expect(centsToDecimal(123456789)).toBe('1234567.89')
  })

  it('no sufre errores de float', () => {
    expect(centsToDecimal(1005)).toBe('10.05')
    expect(centsToDecimal(29)).toBe('0.29')
  })
})

describe('csvCell (RFC 4180)', () => {
  it('deja intacto el texto simple', () => {
    expect(csvCell('Inca Kola')).toBe('Inca Kola')
  })

  it('entrecomilla comas, comillas y saltos de línea; duplica las comillas', () => {
    expect(csvCell('Pan, queso')).toBe('"Pan, queso"')
    expect(csvCell('Dijo "hola"')).toBe('"Dijo ""hola"""')
    expect(csvCell('a\nb')).toBe('"a\nb"')
    expect(csvCell('a\r\nb')).toBe('"a\r\nb"')
  })
})

describe('csvCell: inyección de fórmulas', () => {
  it.each(['=1+1', '+1', '-1', '@SUMA(A1)', '\tx', '\rx'])('neutraliza %j', (v) => {
    expect(csvCell(v).replace(/^"/, '').startsWith("'")).toBe(true)
  })

  it('el apóstrofo va antes de entrecomillar', () => {
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"')
  })

  it('no toca texto que empieza distinto', () => {
    expect(csvCell('Pan -5%')).toBe('Pan -5%')
    expect(csvCell('2x =trampa')).toBe('2x =trampa')
  })
})

describe('buildCsv', () => {
  it('BOM, CRLF, salto final y celdas neutralizadas', () => {
    const out = buildCsv([
      ['a', 'b,c'],
      ['=x', '1'],
    ])
    expect(out).toBe('\uFEFFa,"b,c"\r\n\'=x,1\r\n')
  })
})
