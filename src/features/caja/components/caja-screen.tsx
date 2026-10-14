'use client'

import { useState } from 'react'
import { formatCents } from '@/lib/format'
import { type CatalogProduct, canAddMore, matchesQuery } from '../lib/catalog'
import { computeTotals, itemCount } from '../lib/totals'
import { CategoryChips } from './category-chips'
import { MobileCart } from './mobile-cart'
import type { PaymentMethod } from './payment-methods'
import { ProductCard } from './product-card'
import { ProductSearch } from './product-search'
import type { CartLineView } from './ticket-lines'
import { TicketPanel } from './ticket-panel'

/** id de producto -> cantidad. */
type Cart = Record<string, number>

type Props = {
  products: CatalogProduct[]
  /** Categorías con al menos un producto activo (los chips agregan "Todos"). */
  categories: string[]
}

export function CajaScreen({ products, categories }: Props) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [cart, setCart] = useState<Cart>({})
  const [pay, setPay] = useState<PaymentMethod>('Efectivo')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const byId = new Map(products.map((p) => [p.id, p]))
  const visible = products.filter(
    (p) => (category === null || p.category === category) && matchesQuery(p, query),
  )

  const lines: CartLineView[] = Object.entries(cart).flatMap(([id, qty]) => {
    const item = byId.get(id)
    return item ? [{ item, qty }] : []
  })
  const priced = lines.map((l) => ({ unitPriceCents: l.item.priceCents, qty: l.qty }))
  const totals = computeTotals(priced)
  const count = itemCount(priced)

  function add(id: string) {
    setNotice(null)
    changeQty(id, 1)
  }

  function changeQty(id: string, delta: 1 | -1) {
    setCart((prev) => {
      const item = byId.get(id)
      if (!item) return prev
      const current = prev[id] ?? 0
      if (delta > 0 && !canAddMore(item, current)) return prev
      const qty = current + delta
      const next = { ...prev }
      if (qty <= 0) delete next[id]
      else next[id] = qty
      return next
    })
  }

  function clear() {
    setCart({})
    setSheetOpen(false)
  }

  function charge() {
    if (lines.length === 0) return
    // ponytail: cobro simulado, sin escribir en la DB. La venta real (sale + stock_movement en
    // una transacción) llega con el PR de cobro.
    setNotice(`Venta cobrada: ${formatCents(totals.total)} (${pay})`)
    clear()
  }

  return (
    <div className="flex min-h-0 flex-1 animate-fade-up">
      <section
        aria-label="Catálogo"
        className={`flex min-w-0 flex-1 flex-col gap-4 overflow-auto p-4 md:px-7 md:py-6 ${
          lines.length > 0 ? 'pb-24 md:pb-6' : ''
        }`}
      >
        <ProductSearch value={query} onChange={setQuery} />
        <CategoryChips categories={categories} value={category} onChange={setCategory} />
        {visible.length === 0 ? (
          <p className="py-10 text-center text-muted text-sm">
            No hay productos que coincidan con tu búsqueda.
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
            {visible.map((item) => (
              <ProductCard key={item.id} item={item} onAdd={add} />
            ))}
          </div>
        )}
      </section>

      <TicketPanel
        lines={lines}
        totals={totals}
        pay={pay}
        notice={notice}
        onPay={setPay}
        onChangeQty={changeQty}
        onClear={clear}
        onCharge={charge}
      />

      <MobileCart
        lines={lines}
        count={count}
        totalCents={totals.total}
        open={sheetOpen}
        pay={pay}
        onOpen={() => setSheetOpen(true)}
        onClose={() => setSheetOpen(false)}
        onPay={setPay}
        onChangeQty={changeQty}
        onCharge={charge}
      />
    </div>
  )
}
