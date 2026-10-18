'use client'

import { useState } from 'react'
import { INPUT } from '@/components/ui/field'
import { formatCents } from '@/lib/format'
import {
  buildOrderMessage,
  ORDER_LIMITS,
  type OrderMode,
  priceLine,
  whatsappUrl,
} from '../lib/whatsapp'
import { useStore } from './store-shell'

export function CartDialog({ ref }: { ref: React.Ref<HTMLDialogElement> }) {
  const { store, byId, cart, setQty, remove, clear, cartTotalCents } = useStore()
  const [name, setName] = useState('')
  const [mode, setMode] = useState<OrderMode>('recojo')
  const [address, setAddress] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const rows = cart.flatMap((e) => {
    const p = byId.get(e.productId)
    return p
      ? [
          {
            p,
            priced: priceLine({
              name: p.name,
              qty: e.qty,
              basePriceCents: p.priceCents,
              tiers: p.tiers,
            }),
          },
        ]
      : []
  })
  const hasUnavailable = rows.some((r) => !r.p.available)

  function close(el: HTMLElement) {
    el.closest('dialog')?.close()
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (rows.length === 0) return setError('Tu pedido está vacío')
    if (hasUnavailable) return setError('Quita los productos agotados para continuar')
    if (!name.trim()) return setError('Escribe tu nombre')
    if (mode === 'delivery' && !address.trim()) return setError('Escribe la dirección de entrega')
    setError(null)
    const message = buildOrderMessage({
      storeName: store.tradeName,
      lines: rows.map((r) => r.priced),
      customer: { name, mode, address, note },
    })
    window.open(whatsappUrl(store.whatsapp, message.text), '_blank', 'noopener,noreferrer')
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="cart-title"
      className="m-auto max-h-[92dvh] w-[min(36rem,calc(100vw-1.5rem))] overflow-y-auto rounded-card border border-line bg-surface p-0 text-ink backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 id="cart-title" className="font-semibold text-lg">
            Mi pedido
          </h2>
          <button
            type="button"
            onClick={(e) => close(e.currentTarget)}
            aria-label="Cerrar"
            className="h-10 cursor-pointer rounded-ctl border border-line px-3 text-sm"
          >
            Cerrar
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="text-muted text-sm">Aún no agregaste productos.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {rows.map(({ p, priced }) => (
              <li key={p.id} className="flex flex-col gap-2 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{p.name}</p>
                    <p className="text-muted text-xs">
                      {formatCents(priced.unitPriceCents)} c/u
                      {priced.wholesale ? ' (por mayor)' : ''}
                    </p>
                    {p.available ? null : (
                      <p role="alert" className="text-bad text-xs">
                        Agotado: quítalo para continuar
                      </p>
                    )}
                  </div>
                  <p className="flex-none font-mono text-sm">
                    {formatCents(priced.lineTotalCents)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Quitar una unidad de ${p.name}`}
                    onClick={() => setQty(p.id, priced.qty - 1)}
                    disabled={priced.qty <= 1}
                    className="size-9 cursor-pointer rounded-ctl border border-line disabled:opacity-40"
                  >
                    −
                  </button>
                  <span className="min-w-8 text-center font-mono text-sm">{priced.qty}</span>
                  <button
                    type="button"
                    aria-label={`Agregar una unidad de ${p.name}`}
                    onClick={() => setQty(p.id, priced.qty + 1)}
                    className="size-9 cursor-pointer rounded-ctl border border-line"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    className="ml-auto cursor-pointer text-bad text-sm underline"
                  >
                    Quitar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="flex justify-between font-semibold">
          <span>Total</span>
          <span className="font-mono">{formatCents(cartTotalCents)}</span>
        </p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-muted text-sm" htmlFor="ct-name">
            Tu nombre
            <input
              id="ct-name"
              required
              maxLength={ORDER_LIMITS.name}
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={INPUT}
            />
          </label>

          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="mb-1.5 text-muted">¿Cómo recibes tu pedido?</legend>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                checked={mode === 'recojo'}
                onChange={() => setMode('recojo')}
              />
              Recojo en tienda
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                checked={mode === 'delivery'}
                onChange={() => setMode('delivery')}
              />
              Delivery
            </label>
          </fieldset>

          {mode === 'delivery' ? (
            <label className="flex flex-col gap-1.5 text-muted text-sm" htmlFor="ct-address">
              Dirección de entrega
              <input
                id="ct-address"
                required
                maxLength={ORDER_LIMITS.address}
                autoComplete="street-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className={INPUT}
              />
            </label>
          ) : null}

          <label className="flex flex-col gap-1.5 text-muted text-sm" htmlFor="ct-note">
            Nota (opcional)
            <textarea
              id="ct-note"
              maxLength={ORDER_LIMITS.note}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-ctl border border-line bg-page px-3 py-2 text-ink"
            />
          </label>

          {error ? (
            <p role="alert" className="text-bad text-sm">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            className="h-12 cursor-pointer rounded-ctl bg-accent px-4 font-semibold text-accent-ink"
          >
            Enviar pedido por WhatsApp
          </button>
          <p className="text-muted text-xs">
            Se abrirá WhatsApp con tu pedido listo para enviar. No guardamos tus datos.
          </p>
          {rows.length > 0 ? (
            <button
              type="button"
              onClick={clear}
              className="cursor-pointer self-start text-muted text-sm underline"
            >
              Vaciar pedido
            </button>
          ) : null}
        </form>
      </div>
    </dialog>
  )
}
