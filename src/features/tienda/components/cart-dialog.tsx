'use client'

import { useState } from 'react'
import { INPUT } from '@/components/ui/field'
import { formatCents } from '@/lib/format'
import {
  buildOrderMessage,
  ORDER_LIMITS,
  type OrderMode,
  priceLine,
  shippingLabel,
  whatsappUrl,
} from '../lib/whatsapp'
import { CloseIcon, MinusIcon, PlusIcon, StoreIcon, TrainIcon, TrashIcon, TruckIcon } from './icons'
import { StoreImage } from './store-image'
import { useStore } from './store-shell'

type ModeOption = { mode: OrderMode; title: string; sub: string; icon: React.ReactNode }

function modeOptions(metro: boolean): ModeOption[] {
  const base: ModeOption[] = [
    { mode: 'recojo', title: 'Recojo en tienda', sub: 'Gratis', icon: <StoreIcon /> },
    {
      mode: 'delivery',
      title: 'Delivery',
      sub: 'Costo de envío a confirmar',
      icon: <TruckIcon />,
    },
  ]
  return metro
    ? [
        ...base,
        {
          mode: 'metro',
          title: 'Estación del Metropolitano',
          sub: 'Gratis · día y hora por WhatsApp',
          icon: <TrainIcon />,
        },
      ]
    : base
}

const STEP = 'grid size-8 cursor-pointer place-items-center rounded-full disabled:opacity-40'
const TEXTAREA = 'w-full rounded-ctl border border-line bg-page px-3 py-2 text-ink'

function FieldLabel({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5 text-muted text-sm">
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  )
}

/** Carrito + datos del pedido: panel lateral en escritorio, hoja desde abajo en móvil. */
export function CartDialog({ ref }: { ref: React.Ref<HTMLDialogElement> }) {
  const { store, byId, cart, setQty, remove, clear, cartTotalCents } = useStore()
  const [name, setName] = useState('')
  const [mode, setMode] = useState<OrderMode>('recojo')
  const [address, setAddress] = useState('')
  const [reference, setReference] = useState('')
  const [station, setStation] = useState('')
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
  const options = modeOptions(store.metroDelivery)
  // Si el negocio apaga el Metropolitano mientras el cliente lo tenía elegido, vuelve a recojo
  const activeMode: OrderMode = options.some((o) => o.mode === mode) ? mode : 'recojo'
  const shipping = shippingLabel(activeMode)

  function close(el: HTMLElement) {
    el.closest('dialog')?.close()
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (rows.length === 0) return setError('Tu pedido está vacío')
    if (hasUnavailable) return setError('Quita los productos agotados para continuar')
    if (!name.trim()) return setError('Escribe tu nombre')
    if (activeMode === 'delivery' && !address.trim()) {
      return setError('Escribe la dirección de entrega')
    }
    if (activeMode === 'metro' && !station.trim()) return setError('Escribe la estación')
    setError(null)
    const message = buildOrderMessage({
      storeName: store.tradeName,
      lines: rows.map((r) => r.priced),
      customer: { name, mode: activeMode, address, reference, station, note },
    })
    window.open(whatsappUrl(store.whatsapp, message.text), '_blank', 'noopener,noreferrer')
  }

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: clic en el fondo cierra; con teclado, Esc ya cierra el <dialog>
    <dialog
      ref={ref}
      aria-labelledby="cart-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) e.currentTarget.close()
      }}
      className="fixed inset-x-0 top-auto bottom-0 m-0 max-h-[92dvh] w-full max-w-none overflow-hidden rounded-t-3xl border-0 bg-surface p-0 text-ink backdrop:bg-black/50 md:inset-y-0 md:right-0 md:left-auto md:max-h-none md:w-[26rem] md:rounded-none md:rounded-l-3xl"
    >
      <div className="flex max-h-[92dvh] flex-col md:h-dvh md:max-h-none">
        <div className="flex items-center justify-between gap-3 border-line border-b px-5 py-4">
          <h2 id="cart-title" className="font-bold text-lg">
            Mi pedido
          </h2>
          <button
            type="button"
            onClick={(e) => close(e.currentTarget)}
            aria-label="Cerrar"
            className="grid size-10 cursor-pointer place-items-center rounded-full border border-line"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-5">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-muted text-sm">Aún no agregaste productos.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {rows.map(({ p, priced }) => (
                <li key={p.id} className="flex gap-3 py-3 first:pt-0">
                  <StoreImage
                    src={p.thumbUrl}
                    name={p.name}
                    width={64}
                    height={64}
                    className="size-16 flex-none rounded-xl border border-line"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 font-medium text-sm leading-snug">{p.name}</p>
                      <p className="flex-none font-semibold text-sm">
                        {formatCents(priced.lineTotalCents)}
                      </p>
                    </div>
                    <p className="text-muted text-xs">
                      {priced.qty} × {formatCents(priced.unitPriceCents)}
                      {priced.wholesale ? ' (por mayor)' : ''}
                    </p>
                    {p.available ? null : (
                      <p role="alert" className="text-bad text-xs">
                        Agotado: quítalo para continuar
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <div className="inline-flex items-center rounded-full border border-line">
                        <button
                          type="button"
                          aria-label={`Quitar una unidad de ${p.name}`}
                          onClick={() => setQty(p.id, priced.qty - 1)}
                          disabled={priced.qty <= 1}
                          className={STEP}
                        >
                          <MinusIcon className="size-3.5" />
                        </button>
                        <span className="min-w-7 text-center font-semibold text-sm">
                          {priced.qty}
                        </span>
                        <button
                          type="button"
                          aria-label={`Agregar una unidad de ${p.name}`}
                          onClick={() => setQty(p.id, priced.qty + 1)}
                          className={STEP}
                        >
                          <PlusIcon className="size-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(p.id)}
                        aria-label={`Quitar ${p.name} del pedido`}
                        className="ml-auto grid size-8 cursor-pointer place-items-center rounded-full text-bad"
                      >
                        <TrashIcon className="size-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <dl className="flex flex-col gap-1.5 text-sm" aria-live="polite">
            <div className="flex justify-between text-muted">
              <dt>Subtotal</dt>
              <dd>{formatCents(cartTotalCents)}</dd>
            </div>
            <div className="flex justify-between text-muted">
              <dt>Envío</dt>
              <dd>{shipping}</dd>
            </div>
            <div className="flex justify-between border-line border-t pt-2 font-bold text-base text-ink">
              <dt>Total</dt>
              <dd>
                {formatCents(cartTotalCents)}
                {activeMode === 'delivery' ? ' + envío' : ''}
              </dd>
            </div>
          </dl>

          <form onSubmit={submit} className="flex flex-col gap-4">
            <FieldLabel id="ct-name" label="Tu nombre">
              <input
                id="ct-name"
                required
                maxLength={ORDER_LIMITS.name}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={INPUT}
              />
            </FieldLabel>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-muted text-sm">¿Cómo recibes tu pedido?</legend>
              {options.map((o) => (
                <label key={o.mode} className="cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    checked={activeMode === o.mode}
                    onChange={() => setMode(o.mode)}
                    className="peer sr-only"
                  />
                  <span className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 peer-checked:border-accent peer-checked:bg-accent-soft peer-focus-visible:outline-2 peer-focus-visible:outline-accent peer-focus-visible:outline-offset-2">
                    <span className="grid size-10 flex-none place-items-center rounded-xl bg-accent-soft text-accent">
                      {o.icon}
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="font-semibold text-sm">{o.title}</span>
                      <span className="text-muted text-xs">{o.sub}</span>
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>

            {activeMode === 'delivery' ? (
              <>
                <FieldLabel id="ct-address" label="Dirección de entrega">
                  <input
                    id="ct-address"
                    required
                    maxLength={ORDER_LIMITS.address}
                    autoComplete="street-address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className={INPUT}
                  />
                </FieldLabel>
                <FieldLabel id="ct-reference" label="Referencia (ayuda al repartidor)">
                  <input
                    id="ct-reference"
                    maxLength={ORDER_LIMITS.reference}
                    placeholder="Ej. frente al grifo, portón verde"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    className={INPUT}
                  />
                </FieldLabel>
              </>
            ) : null}

            {activeMode === 'metro' ? (
              <FieldLabel id="ct-station" label="Estación">
                <input
                  id="ct-station"
                  required
                  maxLength={ORDER_LIMITS.station}
                  placeholder="Ej. Estación Naranjal"
                  value={station}
                  onChange={(e) => setStation(e.target.value)}
                  className={INPUT}
                />
              </FieldLabel>
            ) : null}

            <FieldLabel id="ct-note" label="Nota (opcional)">
              <textarea
                id="ct-note"
                maxLength={ORDER_LIMITS.note}
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className={TEXTAREA}
              />
            </FieldLabel>

            {error ? (
              <p role="alert" className="text-bad text-sm">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              className="h-12 cursor-pointer rounded-full bg-accent px-4 font-semibold text-accent-ink"
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
      </div>
    </dialog>
  )
}
