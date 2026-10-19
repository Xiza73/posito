import { describe, expect, it } from 'vitest'
import { toPublicCatalog, toPublicImages } from './public-catalog'

const BASE = 'https://x.supabase.co/storage/v1/object/public/product-images'
const PATH = 'orgAAAA1/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222'

describe('toPublicCatalog', () => {
  const out = toPublicCatalog(
    {
      categories: ['Bebidas'],
      products: [
        {
          id: 'p1',
          name: 'Inca Kola',
          categoryName: 'Bebidas',
          priceCents: 300,
          tiers: [],
          imagePath: PATH,
          available: true,
        },
        {
          id: 'p2',
          name: 'Sin foto',
          categoryName: null,
          priceCents: 100,
          tiers: [],
          imagePath: null,
          available: false,
        },
      ],
    },
    BASE,
  )

  it('manda URLs resueltas, nunca rutas crudas ni imagePath', () => {
    expect(out.products[0].thumbUrl).toBe(`${BASE}/${PATH}-240.webp`)
    expect(out.products[1].thumbUrl).toBeNull()
    expect(Object.keys(out.products[0]).sort()).toEqual(
      ['available', 'categoryName', 'id', 'name', 'priceCents', 'thumbUrl', 'tiers'].sort(),
    )
    expect(JSON.stringify(out)).not.toContain('imagePath')
  })

  it('sin base de Storage no hay URLs', () => {
    expect(toPublicImages([PATH], null)).toEqual([])
  })
})

describe('toPublicImages', () => {
  it('principal primero, URLs grande y miniatura; descarta nulos', () => {
    expect(toPublicImages([PATH, null], BASE)).toEqual([
      { thumbUrl: `${BASE}/${PATH}-240.webp`, imageUrl: `${BASE}/${PATH}-800.webp` },
    ])
  })
})
