'use client'

import { useState } from 'react'
import { formatCents } from '@/lib/format'
import {
  type Category,
  catalogByKey,
  catalogItems,
  MADE_TO_ORDER_STOCK,
} from '../data/products.mock'
import { computeTotals, itemCount } from '../lib/totals'
import { CategoryChips } from './category-chips'
import { MobileCart } from './mobile-cart'
import type { PaymentMethod } from './payment-methods'
import { ProductCard } from './product-card'
import { ProductSearch } from './product-search'
import type { CartLineView } from './ticket-lines'
import { TicketPanel } from './ticket-panel'

/** clave de catálogo -> cantidad. */
type Cart = Record<string, number>

export function CajaScreen() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category>('Todos')
  const [cart, setCart] = useState<Cart>({})
  const [pay, setPay] = useState<PaymentMethod>('Efectivo')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const q = query.trim().toLowerCase()
  const visible = catalogItems.filter(
    (it) =>
      (category === 'Todos' || it.category === category) &&
      (!q || it.label.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q)),
  )

  const lines: CartLineView[] = Object.entries(cart).flatMap(([key, qty]) => {
    const item = catalogByKey.get(key)
    return item ? [{ item, qty }] : []
  })
  const priced = lines.map((l) => ({ unitPriceCents: l.item.priceCents, qty: l.qty }))
  const totals = computeTotals(priced)
  const count = itemCount(priced)

  function add(key: string) {
    setNotice(null)
    changeQty(key, 1)
  }

  function changeQty(key: string, delta: 1 | -1) {
    setCart((prev) => {
      const next = { ...prev }
      const qty = (next[key] ?? 0) + delta
      const stock = catalogByKey.get(key)?.stock ?? 0
      if (delta > 0 && stock < MADE_TO_ORDER_STOCK && qty > stock) return prev
      if (qty <= 0) delete next[key]
      else next[key] = qty
      return next
    })
  }

  function clear() {
    setCart({})
    setSheetOpen(false)
  }

  function charge() {
    if (lines.length === 0) return
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
        <CategoryChips value={category} onChange={setCategory} />
        {visible.length === 0 ? (
          <p className="py-10 text-center text-muted text-sm">
            No hay productos que coincidan con tu búsqueda.
          </p>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
            {visible.map((item) => (
              <ProductCard key={item.key} item={item} onAdd={add} />
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
