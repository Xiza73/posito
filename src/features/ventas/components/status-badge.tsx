import type { SaleStatus } from '@/lib/receipt-lines'

/** Estado con texto (no solo color): "Completada" discreta, "Anulada" en rojo. */
export function StatusBadge({ status }: { status: SaleStatus }) {
  if (status === 'anulada') {
    return (
      <span className="inline-flex rounded-full border border-bad px-2 py-0.5 font-medium text-bad text-xs">
        Anulada
      </span>
    )
  }
  return <span className="text-muted text-xs">Completada</span>
}
