'use client'

import { useRef, useState, useTransition } from 'react'
import { ReceiptDialog } from '@/components/receipt/receipt-dialog'
import type { CustomerOption } from '@/lib/customer-input'
import type { PaymentMethod } from '@/lib/payment'
import type { SaleSummary } from '@/lib/receipt-lines'
import { checkoutAction } from '../actions'
import { type CatalogProduct, canAddMore, matchesQuery } from '../lib/catalog'
import { computeTotals, itemCount } from '../lib/totals'
import { CategoryChips } from './category-chips'
import { CustomerPicker } from './customer-picker'
import { MobileCart } from './mobile-cart'
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
  /** `customer:create`: habilita el alta rápida de clientes en el selector. */
  canCreateCustomer: boolean
  /** Base pública de las fotos (publicImageBase) o null. */
  imageBase: string | null
}

export function CajaScreen({ products, categories, canCreateCustomer, imageBase }: Props) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [cart, setCart] = useState<Cart>({})
  const [pay, setPay] = useState<PaymentMethod>('efectivo')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [receipt, setReceipt] = useState<SaleSummary | null>(null)
  // null = público general. Solo viaja el id: el servidor verifica bodega y estado activo.
  const [customer, setCustomer] = useState<CustomerOption | null>(null)
  const [picking, setPicking] = useState(false)
  const [pending, startTransition] = useTransition()
  // Idempotencia: el mismo id sobrevive a los reintentos hasta que la venta se cobra o se vacía el
  // ticket; así un reintento tras un corte de red no duplica la venta ni el descuento de stock.
  const saleIdRef = useRef<string | null>(null)
  // Tras un corte de red no sabemos si la venta se guardó: el ticket se congela hasta reintentar
  // (confirma sin duplicar) o vaciar. Editarlo devolvería la venta original con otro contenido.
  const [unconfirmed, setUnconfirmed] = useState(false)

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
    if (unconfirmed) return // conserva el aviso: el ticket sigue congelado
    setError(null)
    changeQty(id, 1)
  }

  function changeQty(id: string, delta: 1 | -1) {
    if (unconfirmed) return
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
    setCustomer(null)
    setSheetOpen(false)
    setError(null)
    setUnconfirmed(false)
    saleIdRef.current = null
  }

  function charge() {
    if (lines.length === 0 || pending) return
    saleIdRef.current ??= crypto.randomUUID()
    const input = {
      saleId: saleIdRef.current,
      paymentMethod: pay,
      customerId: customer?.id,
      items: lines.map((l) => ({ productId: l.item.id, quantity: l.qty })),
    }
    setError(null)
    startTransition(async () => {
      try {
        const res = await checkoutAction(input)
        setUnconfirmed(false) // hubo respuesta: el resultado ya se conoce
        if (res.ok) {
          clear()
          setReceipt(res.sale)
        } else {
          setError(res.error)
        }
      } catch {
        // Sin respuesta (red): el resultado es desconocido; se conserva el saleId para reintentar
        setUnconfirmed(true)
        setError(
          'No se pudo confirmar el cobro. Revisa tu conexión y vuelve a cobrar: no se cobrará dos veces. El ticket no se puede modificar hasta confirmarlo.',
        )
      }
    })
  }

  return (
    <>
      <div aria-busy={pending} inert={pending} className="flex min-h-0 flex-1 animate-fade-up">
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
                <ProductCard key={item.id} item={item} imageBase={imageBase} onAdd={add} />
              ))}
            </div>
          )}
        </section>

        <TicketPanel
          lines={lines}
          totals={totals}
          pay={pay}
          error={error}
          pending={pending}
          customer={customer}
          customerLocked={unconfirmed}
          onPickCustomer={() => setPicking(true)}
          onClearCustomer={() => setCustomer(null)}
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
          error={error}
          pending={pending}
          customer={customer}
          customerLocked={unconfirmed}
          onPickCustomer={() => setPicking(true)}
          onClearCustomer={() => setCustomer(null)}
          onOpen={() => setSheetOpen(true)}
          onClose={() => setSheetOpen(false)}
          onPay={setPay}
          onChangeQty={changeQty}
          onCharge={charge}
        />
      </div>
      {picking ? (
        <CustomerPicker
          canCreate={canCreateCustomer}
          onClose={() => setPicking(false)}
          onPick={(c) => {
            setCustomer(c)
            setPicking(false)
          }}
        />
      ) : null}
      <ReceiptDialog sale={receipt} closeLabel="Nueva venta" onClose={() => setReceipt(null)} />
    </>
  )
}
