import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { SaleActions } from '@/features/ventas/components/sale-actions'
import { StatusBadge } from '@/features/ventas/components/status-badge'
import { getSale } from '@/features/ventas/data/sales'
import { VOID_WINDOW_DAYS } from '@/features/ventas/lib/filters'
import { db } from '@/lib/db'
import { formatCents } from '@/lib/format'
import { PAYMENT_LABELS } from '@/lib/payment'
import { can } from '@/lib/permissions'
import { formatReceiptNumber } from '@/lib/receipt'
import { formatReceiptDate } from '@/lib/receipt-lines'
import { getCurrentMember } from '@/lib/session'

const TH = 'px-4 py-3 font-medium'

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  )
}

export default async function VentaPage({ params }: { params: Promise<{ id: string }> }) {
  // Bodega y rol salen de la sesión; getSale devuelve null si es de otra bodega o (cajero) ajena.
  const { member, organization, user } = await getCurrentMember()
  const id = z.uuid().safeParse((await params).id)
  if (!id.success) notFound()

  const sale = await getSale(db, {
    orgId: organization.id,
    viewer: { userId: user.id, role: member.role },
    id: id.data,
  })
  if (!sale) notFound()

  const number = formatReceiptNumber(sale.series, sale.number)
  const voided = sale.status === 'anulada'
  const mayVoid = can(member.role, { sale: ['void'] })
  const canVoid = mayVoid && !voided && sale.withinVoidWindow

  return (
    <div className="flex max-w-3xl animate-fade-up flex-col gap-4 p-4 md:px-7 md:py-6">
      <Link href="/ventas" className="w-fit text-accent text-sm underline-offset-2 hover:underline">
        ← Volver a Ventas
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-mono font-semibold text-lg">Boleta {number}</h2>
        <StatusBadge status={sale.status} />
      </div>

      {voided ? (
        <section
          aria-label="Datos de la anulación"
          className="rounded-card border border-bad bg-surface p-4 text-sm"
        >
          <p className="font-medium text-bad">Venta anulada</p>
          <p className="mt-1 text-muted">
            {sale.voidedAt ? formatReceiptDate(sale.voidedAt) : ''}
            {sale.voidedByName ? ` · por ${sale.voidedByName}` : ''}
          </p>
          {sale.voidReason ? <p className="mt-1">Motivo: {sale.voidReason}</p> : null}
          <p className="mt-1 text-muted">Los productos volvieron al inventario.</p>
        </section>
      ) : null}

      <dl className="grid grid-cols-2 gap-4 rounded-card border border-line bg-surface p-4 md:grid-cols-4">
        <Meta label="Fecha">{formatReceiptDate(sale.createdAt)}</Meta>
        <Meta label="Cajero/a">{sale.cashierName ?? '—'}</Meta>
        <Meta label="Pago">{PAYMENT_LABELS[sale.paymentMethod]}</Meta>
        <Meta label="Total">
          <span className="font-mono font-semibold">{formatCents(sale.totalCents)}</span>
        </Meta>
      </dl>

      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Productos de la venta</caption>
          <thead className="bg-surface-2 text-muted">
            <tr>
              <th scope="col" className={TH}>
                Producto
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Cant.
              </th>
              <th scope="col" className={`${TH} hidden text-right sm:table-cell`}>
                Precio
              </th>
              <th scope="col" className={`${TH} text-right`}>
                Importe
              </th>
            </tr>
          </thead>
          <tbody>
            {sale.lines.map((l, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: lista estática; dos productos pueden llamarse igual
              <tr key={i} className="border-line border-t">
                <td className="px-4 py-3">{l.name}</td>
                <td className="px-4 py-3 text-right font-mono">{l.qty}</td>
                <td className="hidden px-4 py-3 text-right font-mono sm:table-cell">
                  {formatCents(l.unitPriceCents)}
                </td>
                <td className="px-4 py-3 text-right font-mono">{formatCents(l.lineTotalCents)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-line border-t text-sm">
            <tr>
              <th scope="row" colSpan={3} className="px-4 pt-3 text-right font-normal text-muted">
                Subtotal
              </th>
              <td className="px-4 pt-3 text-right font-mono">{formatCents(sale.subtotalCents)}</td>
            </tr>
            <tr>
              <th scope="row" colSpan={3} className="px-4 text-right font-normal text-muted">
                IGV 18 % (incluido)
              </th>
              <td className="px-4 text-right font-mono">{formatCents(sale.igvCents)}</td>
            </tr>
            <tr>
              <th scope="row" colSpan={3} className="px-4 py-3 text-right font-semibold">
                Total
              </th>
              <td className="px-4 py-3 text-right font-mono font-semibold">
                {formatCents(sale.totalCents)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <SaleActions sale={sale} businessName={organization.name} canVoid={canVoid} />

      {mayVoid && !voided && !sale.withinVoidWindow ? (
        <p className="text-muted text-sm">
          Solo se pueden anular ventas de los últimos {VOID_WINDOW_DAYS} días.
        </p>
      ) : null}
    </div>
  )
}
