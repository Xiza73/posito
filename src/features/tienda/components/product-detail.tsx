'use client'

import Link from 'next/link'
import { useState } from 'react'
import { formatCents } from '@/lib/format'
import type { PublicImage, PublicProduct } from '../lib/public-catalog'
import { clampQty, MAX_LINE_QTY, priceLine } from '../lib/whatsapp'
import { AvailabilityLine } from './catalog-view'
import { MinusIcon, PlusIcon } from './icons'
import { StoreImage } from './store-image'
import { useStore } from './store-shell'

const STEP = 'grid size-10 cursor-pointer place-items-center rounded-full disabled:opacity-40'

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

  // Mismo cálculo que el carrito y el mensaje (puro, con los niveles del catálogo)
  const priced = priceLine({ name: p.name, qty, basePriceCents: p.priceCents, tiers: p.tiers })
  const saved = priced.qty * p.priceCents - priced.lineTotalCents

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/tienda/${slug}`} className="self-start text-accent text-sm underline">
        ← Volver al catálogo
      </Link>
      <div className="grid gap-6 md:grid-cols-2 md:gap-10">
        <div className="flex flex-col gap-3">
          <StoreImage
            src={images[selected]?.imageUrl ?? null}
            name={p.name}
            eager
            width={800}
            height={800}
            className="aspect-square w-full rounded-3xl border border-line"
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
                    className={`cursor-pointer rounded-xl outline-offset-2 ${selected === i ? 'outline-2 outline-accent' : 'opacity-80'}`}
                  >
                    <StoreImage
                      src={img.thumbUrl}
                      name={`${p.name} ${i + 1}`}
                      width={64}
                      height={64}
                      className="size-16 rounded-xl border border-line"
                    />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            {p.categoryName ? (
              <p className="font-medium text-accent text-xs uppercase tracking-wide">
                {p.categoryName}
              </p>
            ) : null}
            <h1 className="font-bold text-2xl leading-tight">{p.name}</h1>
          </div>
          <p className="font-bold text-3xl">{formatCents(p.priceCents)}</p>
          <AvailabilityLine available={p.available} />

          {p.tiers.length > 0 ? (
            <section
              aria-labelledby="pd-tiers"
              className="rounded-2xl border border-line bg-surface p-4"
            >
              <h2 id="pd-tiers" className="pb-2 font-semibold text-sm">
                Precio por mayor
              </h2>
              <table className="w-full text-sm">
                <tbody>
                  {p.tiers.map((t) => (
                    <tr
                      key={t.minQty}
                      className={`border-line border-t ${priced.wholesale && priced.unitPriceCents === t.unitPriceCents ? 'font-semibold text-ok' : ''}`}
                    >
                      <td className="py-2">Desde {t.minQty} unidades</td>
                      <td className="py-2 text-right">{formatCents(t.unitPriceCents)} c/u</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}

          {p.available ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <fieldset className="inline-flex min-w-0 items-center rounded-full border border-line bg-surface p-0.5">
                  <legend className="sr-only">Cantidad</legend>
                  <button
                    type="button"
                    aria-label="Quitar una unidad"
                    disabled={qty <= 1}
                    onClick={() => setQty(clampQty(qty - 1))}
                    className={STEP}
                  >
                    <MinusIcon className="size-4" />
                  </button>
                  <input
                    aria-label="Cantidad"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_LINE_QTY}
                    value={qty}
                    onChange={(e) => setQty(clampQty(Number(e.target.value) || 1))}
                    className="h-10 w-12 bg-transparent text-center font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <button
                    type="button"
                    aria-label="Agregar una unidad"
                    disabled={qty >= MAX_LINE_QTY}
                    onClick={() => setQty(clampQty(qty + 1))}
                    className={STEP}
                  >
                    <PlusIcon className="size-4" />
                  </button>
                </fieldset>
                <button
                  type="button"
                  onClick={() => {
                    add(p.id, qty)
                    openCart()
                  }}
                  className="h-12 min-w-0 flex-1 cursor-pointer rounded-full bg-accent px-6 font-semibold text-accent-ink"
                >
                  Agregar · {formatCents(priced.lineTotalCents)}
                </button>
              </div>
              <p role="status" className="min-h-5 font-medium text-ok text-sm">
                {saved > 0 ? `Ahorras ${formatCents(saved)}` : ''}
              </p>
            </div>
          ) : (
            <p className="text-muted text-sm">Este producto está agotado por ahora.</p>
          )}
        </div>
      </div>
    </div>
  )
}
