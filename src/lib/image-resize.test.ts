import { describe, expect, it } from 'vitest'
import { fitWithin, validateImageFile } from './image-resize'

describe('fitWithin', () => {
  it('reduce el lado mayor a `max` manteniendo la proporción', () => {
    expect(fitWithin(4000, 3000, 800)).toEqual({ width: 800, height: 600 })
    expect(fitWithin(3000, 4000, 800)).toEqual({ width: 600, height: 800 })
    expect(fitWithin(1000, 1000, 240)).toEqual({ width: 240, height: 240 })
  })

  it('no agranda imágenes pequeñas', () => {
    expect(fitWithin(200, 100, 800)).toEqual({ width: 200, height: 100 })
  })

  it('nunca devuelve 0 en imágenes extremas', () => {
    expect(fitWithin(10000, 1, 240)).toEqual({ width: 240, height: 1 })
  })

  it('rechaza dimensiones inválidas', () => {
    expect(() => fitWithin(0, 100, 800)).toThrow(RangeError)
    expect(() => fitWithin(100, Number.NaN, 800)).toThrow(RangeError)
  })
})

describe('validateImageFile', () => {
  it('acepta JPG, PNG y WebP dentro del límite', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(validateImageFile({ type, size: 1000 })).toBeNull()
    }
  })

  it('rechaza otros tipos, vacíos y archivos de más de 15 MB', () => {
    expect(validateImageFile({ type: 'image/gif', size: 1000 })).not.toBeNull()
    expect(validateImageFile({ type: 'application/pdf', size: 1000 })).not.toBeNull()
    expect(validateImageFile({ type: 'image/png', size: 0 })).not.toBeNull()
    expect(validateImageFile({ type: 'image/png', size: 15 * 1024 * 1024 + 1 })).not.toBeNull()
    expect(validateImageFile({ type: 'image/png', size: 15 * 1024 * 1024 })).toBeNull()
  })
})
