'use client'

import Link from 'next/link'
import { useState } from 'react'
import { formatCents } from '@/lib/format'
import type { PublicImage, PublicProduct } from '../lib/public-catalog'
import { MAX_LINE_QTY } from '../lib/whatsapp'
import { AvailabilityBadge } from './catalog-view'
import { StoreImage } from './store-image'
import { useStore } from './store-shell'

/** Ficha: galería, precio, tabla por mayor, cantidad y agregar. Todo viene resuelto del servidor (URLs, no rutas). */
export function ProductDetail({
  product: p,
  images,
}: {
  product: PublicProduct
  images: PublicImage[]
}) {
  const { slug, add, openCart } = useStore()
  const [selected, setSelected] = useState(0)
  const [qty, setQty] = useState(1)

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/tienda/${slug}`} className="text-accent text-sm underline">
        ← Volver al catálogo
      </Link>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <StoreImage
            src={images[selected]?.imageUrl ?? null}
            name={p.name}
            eager
            width={800}
            height={800}
            className="aspect-square w-full rounded-card"
          />
          {images.length > 1 ? (
            <ul className="flex flex-wrap gap-2">
              {images.map((img, i) => (
                <li key={img.imageUrl}>
                  <button
                    type="button"
                    onClick={() => setSelected(i)}
                    aria-label={`Ver foto ${i + 1}`}
                    aria-pressed={selected === i}
                    className={`cursor-pointer rounded-ctl ${selected === i ? 'outline-2 outline-accent' : ''}`}
                  >
                    <StoreImage
                      src={img.thumbUrl}
                      name={`${p.name} ${i + 1}`}
                      width={64}
                      height={64}
                      className="size-16 rounded-ctl"
                    />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          {p.categoryName ? <p className="text-muted text-xs">{p.categoryName}</p> : null}
          <h1 className="font-semibold text-xl">{p.name}</h1>
          <p className="font-mono font-semibold text-2xl">{formatCents(p.priceCents)}</p>
          <AvailabilityBadge available={p.available} />

          {p.tiers.length > 0 ? (
            <table className="w-full max-w-xs text-sm">
              <caption className="pb-1 text-left text-muted text-xs">Precio por mayor</caption>
              <tbody>
                {p.tiers.map((t) => (
                  <tr key={t.minQty} className="border-line border-t">
                    <td className="py-1.5">Desde {t.minQty}</td>
                    <td className="py-1.5 text-right font-mono">
                      {formatCents(t.unitPriceCents)} c/u
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {p.available ? (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                Cantidad
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_LINE_QTY}
                  value={qty}
                  onChange={(e) =>
                    setQty(Math.min(MAX_LINE_QTY, Math.max(1, Number(e.target.value) || 1)))
                  }
                  className="h-11 w-20 rounded-ctl border border-line bg-page px-3 text-ink"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  add(p.id, qty)
                  openCart()
                }}
                className="h-11 cursor-pointer rounded-ctl bg-accent px-5 font-semibold text-accent-ink"
              >
                Agregar al pedido
              </button>
            </div>
          ) : (
            <p className="text-muted text-sm">Este producto está agotado por ahora.</p>
          )}
        </div>
      </div>
    </div>
  )
}
