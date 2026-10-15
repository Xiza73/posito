'use client'

import { useState } from 'react'
import { ReceiptDialog } from '@/components/receipt/receipt-dialog'
import type { SaleSummary } from '@/lib/receipt-lines'
import { VoidSaleDialog } from './void-sale-dialog'

type Props = {
  sale: SaleSummary
  businessName: string
  /** Puede anular: permiso `sale:void`, venta completada y dentro de la ventana (calculado en el servidor). */
  canVoid: boolean
}

/** Botones del detalle: ver/reimprimir ticket y anular. */
export function SaleActions({ sale, businessName, canVoid }: Props) {
  const [showReceipt, setShowReceipt] = useState(false)
  const [showVoid, setShowVoid] = useState(false)

  return (
    <>
      <div className="flex flex-wrap gap-2.5">
        <button
          type="button"
          onClick={() => setShowReceipt(true)}
          className="h-11 cursor-pointer rounded-ctl bg-accent px-5 font-semibold text-accent-ink text-sm"
        >
          Ver ticket / Reimprimir
        </button>
        {canVoid ? (
          <button
            type="button"
            onClick={() => setShowVoid(true)}
            className="h-11 cursor-pointer rounded-ctl border border-bad px-5 font-semibold text-bad text-sm hover:bg-surface-2"
          >
            Anular venta
          </button>
        ) : null}
      </div>

      <ReceiptDialog
        sale={showReceipt ? sale : null}
        businessName={businessName}
        onClose={() => setShowReceipt(false)}
      />
      {canVoid ? (
        <VoidSaleDialog open={showVoid} onClose={() => setShowVoid(false)} sale={sale} />
      ) : null}
    </>
  )
}
