'use client'

import { useState } from 'react'
import { ReceiptDialog } from '@/components/receipt/receipt-dialog'
import type { SaleSummary } from '@/lib/receipt-lines'
import { ApproveSaleDialog } from './approve-sale-dialog'
import { VoidSaleDialog } from './void-sale-dialog'

type Props = {
  sale: SaleSummary
  /** Puede anular: permiso `sale:void`, venta completada y dentro de la ventana (calculado en el servidor). */
  canVoid: boolean
  /** Venta pendiente y permiso `sale:approve`. */
  canApprove: boolean
  /** Venta pendiente y permiso `sale:void`: rechazar = anular sin ventana de 7 días. */
  canReject: boolean
}

/** Botones del detalle: ver/reimprimir ticket, aprobar/rechazar (pendientes) y anular. */
export function SaleActions({ sale, canVoid, canApprove, canReject }: Props) {
  const [showReceipt, setShowReceipt] = useState(false)
  const [showVoid, setShowVoid] = useState(false)
  const [showApprove, setShowApprove] = useState(false)
  const canCancel = canVoid || canReject

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
        {canApprove ? (
          <button
            type="button"
            onClick={() => setShowApprove(true)}
            className="h-11 cursor-pointer rounded-ctl border border-ok px-5 font-semibold text-ok text-sm hover:bg-surface-2"
          >
            Aprobar
          </button>
        ) : null}
        {canCancel ? (
          <button
            type="button"
            onClick={() => setShowVoid(true)}
            className="h-11 cursor-pointer rounded-ctl border border-bad px-5 font-semibold text-bad text-sm hover:bg-surface-2"
          >
            {canReject ? 'Rechazar' : 'Anular venta'}
          </button>
        ) : null}
      </div>

      <ReceiptDialog sale={showReceipt ? sale : null} onClose={() => setShowReceipt(false)} />
      {canCancel ? (
        <VoidSaleDialog
          open={showVoid}
          onClose={() => setShowVoid(false)}
          sale={sale}
          mode={canReject ? 'reject' : 'void'}
        />
      ) : null}
      {canApprove ? (
        <ApproveSaleDialog open={showApprove} onClose={() => setShowApprove(false)} sale={sale} />
      ) : null}
    </>
  )
}
