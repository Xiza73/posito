import { describe, expect, it } from 'vitest'
import { galleryUploadSummary, planGalleryUpload } from './gallery-upload'

describe('planGalleryUpload', () => {
  it('sube todo si cabe', () => {
    expect(planGalleryUpload(['a', 'b'], 3, 8)).toEqual({ toUpload: ['a', 'b'], skipped: 0 })
  })

  it('respeta el orden y deja fuera lo que no cabe', () => {
    expect(planGalleryUpload(['a', 'b', 'c', 'd'], 6, 8)).toEqual({
      toUpload: ['a', 'b'],
      skipped: 2,
    })
  })

  it('galería llena: nada se sube', () => {
    expect(planGalleryUpload(['a'], 8, 8)).toEqual({ toUpload: [], skipped: 1 })
  })
})

describe('galleryUploadSummary', () => {
  it('todo bien → null', () => {
    expect(galleryUploadSummary([], 0)).toBeNull()
  })

  it('una falla muestra el nombre y el motivo', () => {
    expect(galleryUploadSummary([{ name: 'a.png', error: 'muy grande' }], 0)).toBe(
      'No se pudo subir "a.png": muy grande',
    )
  })

  it('varias fallas y fotos fuera del límite', () => {
    expect(
      galleryUploadSummary(
        [
          { name: 'a.png', error: 'x' },
          { name: 'b.png', error: 'y' },
        ],
        2,
      ),
    ).toBe(
      'No se pudieron subir 2 fotos: a.png, b.png. 2 fotos quedaron fuera: máximo 8 fotos extra.',
    )
  })
})
