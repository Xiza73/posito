'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import {
  addToCart,
  type CartEntry,
  cartStorageKey,
  parseStoredCart,
  reconcileCart,
  removeFromCart,
  setCartQty,
} from '../lib/cart'
import type { PublicCatalog, PublicProduct } from '../lib/public-catalog'
import { orderTotalCents } from '../lib/whatsapp'
import { CartDialog } from './cart-dialog'
import { BagIcon, SearchIcon, WhatsappIcon } from './icons'

/** Lo único del perfil que viaja al navegador (sin ids internos). */
export type PublicStore = {
  tradeName: string
  address: string | null
  hours: string | null
  /** 51XXXXXXXXX, para wa.me. */
  whatsapp: string
  /** Ofrece entrega en estación del Metropolitano. */
  metroDelivery: boolean
}

type StoreContextValue = {
  slug: string
  store: PublicStore
  catalog: PublicCatalog
  byId: ReadonlyMap<string, PublicProduct>
  cart: CartEntry[]
  cartCount: number
  cartTotalCents: number
  add: (productId: string, qty?: number) => void
  setQty: (productId: string, qty: number) => void
  remove: (productId: string) => void
  clear: () => void
  openCart: () => void
  /** Búsqueda del catálogo (vive aquí porque el campo está en el encabezado). */
  query: string
  setQuery: (q: string) => void
}

const StoreContext = createContext<StoreContextValue | null>(null)

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore debe usarse dentro de StoreShell')
  return ctx
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Modo privado / cuota llena: el carrito sigue funcionando en memoria
  }
}

/**
 * Encabezado + carrito de la tienda pública. Vive en el layout, así que el carrito sobrevive a la
 * navegación entre catálogo y fichas. Guarda en localStorage SOLO { productId, qty } por tienda.
 */
export function StoreShell({
  slug,
  store,
  catalog,
  children,
}: {
  slug: string
  store: PublicStore
  catalog: PublicCatalog
  children: React.ReactNode
}) {
  const byId = new Map(catalog.products.map((p) => [p.id, p]))
  const [cart, setCart] = useState<CartEntry[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [query, setQuery] = useState('')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const key = cartStorageKey(slug)

  // Carga tras montar (evita desajustes de hidratación) y descarta lo que ya no está en el catálogo
  // biome-ignore lint/correctness/useExhaustiveDependencies: solo al montar / cambiar de tienda
  useEffect(() => {
    const ids = new Set(catalog.products.map((p) => p.id))
    setCart(reconcileCart(parseStoredCart(readStorage(key)), ids))
    setHydrated(true)
  }, [key])

  useEffect(() => {
    if (hydrated) writeStorage(key, JSON.stringify(cart))
  }, [cart, hydrated, key])

  const lines = cart.flatMap((e) => {
    const p = byId.get(e.productId)
    return p ? [{ name: p.name, qty: e.qty, basePriceCents: p.priceCents, tiers: p.tiers }] : []
  })

  const value: StoreContextValue = {
    slug,
    store,
    catalog,
    byId,
    cart,
    cartCount: cart.reduce((n, e) => n + e.qty, 0),
    cartTotalCents: orderTotalCents(lines),
    add: (id, qty = 1) => {
      const p = byId.get(id)
      if (p?.available) setCart((c) => addToCart(c, id, qty))
    },
    setQty: (id, qty) => setCart((c) => setCartQty(c, id, qty)),
    remove: (id) => setCart((c) => removeFromCart(c, id)),
    clear: () => setCart([]),
    openCart: () => dialogRef.current?.showModal(),
    query,
    setQuery,
  }

  return (
    <StoreContext.Provider value={value}>
      <StoreHeader />
      <main className="mx-auto min-w-0 max-w-6xl px-4 py-5 md:py-7">{children}</main>
      <StoreFooter />
      <CartDialog ref={dialogRef} />
    </StoreContext.Provider>
  )
}

function StoreHeader() {
  const { slug, store, cartCount, openCart, query, setQuery } = useStore()
  const pathname = usePathname()
  const router = useRouter()
  const home = `/tienda/${slug}`

  function search(value: string) {
    setQuery(value)
    // Desde una ficha, buscar lleva al catálogo
    if (pathname !== home) router.push(home)
  }

  return (
    <header className="sticky top-0 z-20 border-line border-b bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
        <Link href={home} className="order-1 flex min-w-0 flex-1 items-center gap-3 md:flex-none">
          <span
            aria-hidden="true"
            className="grid size-10 flex-none place-items-center rounded-xl bg-accent font-bold text-accent-ink text-lg"
          >
            {store.tradeName.trim().charAt(0).toUpperCase() || 'T'}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-base leading-tight">
              {store.tradeName}
            </span>
            {store.hours ? (
              <span className="flex items-center gap-1.5 text-muted text-xs">
                <span aria-hidden="true" className="size-1.5 flex-none rounded-full bg-muted" />
                <span className="truncate">Horario: {store.hours}</span>
              </span>
            ) : null}
          </span>
        </Link>

        <form
          onSubmit={(e) => e.preventDefault()}
          className="field-box order-3 flex h-11 w-full items-center gap-2 rounded-full border border-line bg-page px-4 md:order-2 md:w-auto md:flex-1"
        >
          <SearchIcon className="size-4.5 flex-none text-muted" />
          <label htmlFor="st-search" className="sr-only">
            Buscar productos
          </label>
          <input
            id="st-search"
            type="search"
            placeholder="Buscar productos"
            value={query}
            onChange={(e) => search(e.target.value)}
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-sm"
          />
        </form>

        <button
          type="button"
          onClick={openCart}
          aria-label="Ver mi pedido"
          className="relative order-2 grid size-11 flex-none cursor-pointer place-items-center rounded-full bg-accent text-accent-ink md:order-3"
        >
          <BagIcon />
          {cartCount > 0 ? (
            <span
              aria-hidden="true"
              className="absolute -top-1 -right-1 grid min-w-5 place-items-center rounded-full border-2 border-surface bg-ink px-1 font-semibold text-[0.65rem] text-surface leading-4"
            >
              {cartCount}
            </span>
          ) : null}
        </button>
        <span className="sr-only" aria-live="polite">
          {cartCount === 1 ? '1 unidad en tu pedido' : `${cartCount} unidades en tu pedido`}
        </span>
      </div>
    </header>
  )
}

function StoreFooter() {
  const { store } = useStore()
  return (
    <footer className="mt-10 border-line border-t bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 text-sm md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{store.tradeName}</p>
          {store.address ? <p className="text-muted">{store.address}</p> : null}
          {store.hours ? <p className="text-muted">{store.hours}</p> : null}
        </div>
        <a
          href={`https://wa.me/${store.whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center gap-2 self-start rounded-full border border-line px-4 font-medium"
        >
          <WhatsappIcon className="size-5 text-[#25D366]" />
          Escríbenos por WhatsApp
        </a>
      </div>
    </footer>
  )
}
