'use client'

import { useRef, useState, useTransition } from 'react'
import { ReceiptDialog } from '@/components/receipt/receipt-dialog'
import type { CustomerOption } from '@/lib/customer-input'
import type { PaymentMethod } from '@/lib/payment'
import { unitPriceFor } from '@/lib/pricing'
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

function withoutKey<T>(rec: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...rest } = rec
  return rest
}

type Props = {
  products: CatalogProduct[]
  /** Categorías con al menos un producto activo (los chips agregan "Todos"). */
  categories: string[]
  /** `customer:create`: habilita el alta rápida de clientes en el selector. */
  canCreateCustomer: boolean
  /** Base pública de las fotos (publicImageBase) o null. */
  imageBase: string | null
  /** La bodega permite editar el total de cada línea (ajuste "Precios en la Caja"). */
  allowManualPrice: boolean
}

export function CajaScreen({
  products,
  categories,
  canCreateCustomer,
  imageBase,
  allowManualPrice,
}: Props) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [cart, setCart] = useState<Cart>({})
  // id de producto -> total editado a mano (céntimos). Se descarta al cambiar la cantidad de esa línea.
  const [manual, setManual] = useState<Record<string, number>>({})
  // Líneas cuyo precio editado se restableció por un cambio de cantidad (aviso sutil)
  const [resetIds, setResetIds] = useState<Record<string, true>>({})
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
    // Solo para mostrar: el servidor recalcula el nivel por mayor al cobrar
    return item
      ? [
          {
            item,
            qty,
            price: unitPriceFor({ basePriceCents: item.priceCents, tiers: item.tiers }, qty),
            manualTotalCents: allowManualPrice ? (manual[id] ?? null) : null,
            manualWasReset: resetIds[id] === true,
          },
        ]
      : []
  })
  const priced = lines.map((l) => ({
    unitPriceCents: l.price.unitPriceCents,
    qty: l.qty,
    totalCents: l.manualTotalCents ?? undefined,
  }))
  const totals = computeTotals(priced)
  const count = itemCount(priced)

  function add(id: string) {
    if (unconfirmed) return // conserva el aviso: el ticket sigue congelado
    setError(null)
    changeQty(id, 1)
  }

  function changeQty(id: string, delta: 1 | -1) {
    if (unconfirmed) return
    const item = byId.get(id)
    if (!item) return
    const current = cart[id] ?? 0
    if (delta > 0 && !canAddMore(item, current)) return
    const qty = current + delta
    // Un total editado no vale para otra cantidad: se vuelve al precio automático y se avisa
    if (manual[id] !== undefined) {
      setManual(withoutKey(manual, id))
      if (qty > 0) setResetIds((r) => ({ ...r, [id]: true }))
    }
    if (qty <= 0) setResetIds((r) => withoutKey(r, id))
    setCart(qty <= 0 ? withoutKey(cart, id) : { ...cart, [id]: qty })
  }

  function setManualTotal(id: string, cents: number | null) {
    if (unconfirmed || !allowManualPrice) return
    setResetIds((r) => withoutKey(r, id))
    setManual((prev) => (cents === null ? withoutKey(prev, id) : { ...prev, [id]: cents }))
  }

  function clear() {
    setCart({})
    setManual({})
    setResetIds({})
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
      expectedTotalCents: totals.total,
      items: lines.map((l) => ({
        productId: l.item.id,
        quantity: l.qty,
        ...(l.manualTotalCents !== null ? { lineTotalCents: l.manualTotalCents } : {}),
      })),
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
          allowManualPrice={allowManualPrice}
          onSetManual={setManualTotal}
          locked={unconfirmed}
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
          allowManualPrice={allowManualPrice}
          onSetManual={setManualTotal}
          locked={unconfirmed}
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
