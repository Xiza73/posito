'use client'

import Link from 'next/link'
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

/** Lo único del perfil que viaja al navegador (sin ids internos). */
export type PublicStore = {
  tradeName: string
  address: string | null
  hours: string | null
  /** 51XXXXXXXXX, para wa.me. */
  whatsapp: string
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
  }

  return (
    <StoreContext.Provider value={value}>
      <header className="sticky top-0 z-20 border-line border-b bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <Link href={`/tienda/${slug}`} className="block truncate font-semibold text-lg">
              {store.tradeName}
            </Link>
            {store.address || store.hours ? (
              <p className="truncate text-muted text-xs">
                {[store.address, store.hours].filter(Boolean).join(' · ')}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={value.openCart}
            aria-label={`Ver mi pedido, ${value.cartCount} unidades`}
            className="relative h-11 flex-none cursor-pointer rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm"
          >
            Mi pedido
            {value.cartCount > 0 ? (
              <span className="ml-2 rounded-full bg-accent-ink px-2 py-0.5 text-accent text-xs">
                {value.cartCount}
              </span>
            ) : null}
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-5">{children}</main>
      <CartDialog ref={dialogRef} />
    </StoreContext.Provider>
  )
}
