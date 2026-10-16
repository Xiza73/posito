import { describe, expect, it } from 'vitest'
import {
  averageTicket,
  dayLabel,
  fillDays,
  fillHours,
  percentChange,
  sharePercent,
} from './metrics'

describe('averageTicket', () => {
  it('redondea a céntimos enteros', () => {
    expect(averageTicket(1000, 3)).toBe(333)
    expect(averageTicket(1001, 2)).toBe(501) // 500.5 -> 501
  })

  it('es 0 sin ventas (sin dividir por cero)', () => {
    expect(averageTicket(0, 0)).toBe(0)
    expect(averageTicket(500, 0)).toBe(0)
  })
})

describe('percentChange', () => {
  it('sube y baja', () => {
    expect(percentChange(150, 100)).toBe(50)
    expect(percentChange(50, 100)).toBe(-50)
    expect(percentChange(100, 100)).toBe(0)
  })

  it('devuelve null si el período previo es 0', () => {
    expect(percentChange(100, 0)).toBeNull()
    expect(percentChange(0, 0)).toBeNull()
  })

  it('cae a -100 % si el período actual es 0', () => {
    expect(percentChange(0, 80)).toBe(-100)
  })

  it('redondea y no devuelve -0', () => {
    expect(percentChange(1001, 1000)).toBe(0)
    expect(Object.is(percentChange(999, 1000), 0)).toBe(true)
    expect(percentChange(2, 3)).toBe(-33)
  })

  it('con valores negativos usa el valor absoluto de la base', () => {
    expect(percentChange(-50, -100)).toBe(50)
    expect(percentChange(-150, -100)).toBe(-50)
    expect(percentChange(100, -100)).toBe(200)
  })
})

describe('sharePercent', () => {
  it('calcula la participación y tolera total 0', () => {
    expect(sharePercent(25, 100)).toBe(25)
    expect(sharePercent(1, 3)).toBe(33)
    expect(sharePercent(10, 0)).toBe(0)
  })
})

describe('fillHours', () => {
  it('siempre devuelve 24 horas con ceros donde no hay ventas', () => {
    const out = fillHours([{ hour: 9, cents: 500, count: 2 }])
    expect(out).toHaveLength(24)
    expect(out[0]).toEqual({ key: '0', label: '00h', cents: 0, count: 0 })
    expect(out[9]).toEqual({ key: '9', label: '09h', cents: 500, count: 2 })
    expect(out[23].cents).toBe(0)
  })

  it('ignora horas fuera de 0-23', () => {
    const out = fillHours([{ hour: 24, cents: 1, count: 1 }])
    expect(out.reduce((a, b) => a + b.cents, 0)).toBe(0)
  })
})

describe('fillDays', () => {
  it('un bucket por día, en el orden dado', () => {
    const out = fillDays(
      ['2026-10-14', '2026-10-15'],
      [{ day: '2026-10-15', cents: 700, count: 3 }],
    )
    expect(out.map((b) => b.cents)).toEqual([0, 700])
    expect(out[0].key).toBe('2026-10-14')
  })

  it('etiqueta con el día de la semana (calendario puro)', () => {
    expect(dayLabel('2026-10-15')).toBe('Ju 15') // jueves
    expect(dayLabel('2026-10-18')).toBe('Do 18')
  })
})
