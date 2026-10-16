import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { CustomerActions } from '@/features/clientes/components/customer-actions'
import { CustomerSales } from '@/features/clientes/components/customer-sales'
import { getCustomer, listCustomerSales } from '@/features/clientes/data/customers'
import { formatLimaDate } from '@/features/clientes/lib/format'
import { db } from '@/lib/db'
import { formatDocument } from '@/lib/document'
import { formatCents } from '@/lib/format'
import { initials } from '@/lib/initials'
import { can, seesAllSales } from '@/lib/permissions'
import { getCurrentMember } from '@/lib/session'

type Params = Promise<{ id: string }>
type SearchParams = Promise<Record<string, string | string[] | undefined>>

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted text-xs">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{children}</dd>
    </div>
  )
}

const BTN =
  'inline-flex h-10 items-center rounded-ctl border border-line px-4 font-medium text-sm hover:bg-surface-2'

export default async function ClientePage({
  params,
  searchParams,
}: {
  params: Params
  searchParams: SearchParams
}) {
  // Bodega y rol salen de la sesión; getCustomer devuelve null si es de otra bodega.
  const { member, organization, user } = await getCurrentMember()
  const id = z.uuid().safeParse((await params).id)
  if (!id.success) notFound()

  const pageParam = z.coerce
    .number()
    .int()
    .min(1)
    .max(100_000)
    .catch(1)
    .parse((await searchParams).pagina)
  const viewer = { userId: user.id, role: member.role }

  const customer = await getCustomer(db, { orgId: organization.id, viewer, id: id.data })
  if (!customer) notFound()
  const history = await listCustomerSales(db, {
    orgId: organization.id,
    viewer,
    customerId: customer.id,
    page: pageParam,
  })

  const base = `/clientes/${customer.id}`
  const ownOnly = !seesAllSales(member.role)

  return (
    <div className="flex max-w-4xl animate-fade-up flex-col gap-4 p-4 md:px-7 md:py-6">
      <Link
        href="/clientes"
        className="w-fit text-accent text-sm underline-offset-2 hover:underline"
      >
        ← Volver a Clientes
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            aria-hidden="true"
            className="grid size-11 flex-none place-items-center rounded-full bg-accent-soft font-semibold text-accent text-sm"
          >
            {initials(customer.name)}
          </div>
          <h2 className="min-w-0 break-words font-semibold text-lg">{customer.name}</h2>
          {customer.active ? null : (
            <span className="rounded-full border border-line px-2 py-0.5 text-muted text-xs">
              Inactivo
            </span>
          )}
        </div>
        <CustomerActions
          customer={customer}
          canUpdate={can(member.role, { customer: ['update'] })}
          canDelete={can(member.role, { customer: ['delete'] })}
        />
      </div>

      {customer.active ? null : (
        <p role="note" className="text-muted text-sm">
          Cliente inactivo: no aparece en la caja ni en la lista. Su historial se conserva.
        </p>
      )}

      <dl className="grid grid-cols-1 gap-4 rounded-card border border-line bg-surface p-4 sm:grid-cols-2 md:grid-cols-3">
        <Meta label="Documento">
          {customer.documentType && customer.documentNumber ? (
            <span className="font-mono">
              {formatDocument(customer.documentType, customer.documentNumber)}
            </span>
          ) : (
            '—'
          )}
        </Meta>
        <Meta label="Teléfono">{customer.phone ?? '—'}</Meta>
        <Meta label="Correo">{customer.email ?? '—'}</Meta>
        <Meta label="Dirección">{customer.address ?? '—'}</Meta>
        <Meta label="Cliente desde">{formatLimaDate(customer.createdAt)}</Meta>
      </dl>

      <dl className="grid grid-cols-3 gap-3">
        {[
          { label: 'Compras', value: String(customer.purchaseCount) },
          { label: 'Total gastado', value: formatCents(customer.totalSpentCents) },
          {
            label: 'Última compra',
            value: customer.lastPurchaseAt ? formatLimaDate(customer.lastPurchaseAt) : '—',
          },
        ].map((s) => (
          <div key={s.label} className="rounded-card border border-line bg-surface p-4">
            <dt className="text-muted text-xs">{s.label}</dt>
            <dd className="mt-1 font-mono font-semibold text-base md:text-xl">{s.value}</dd>
          </div>
        ))}
      </dl>
      {ownOnly ? (
        <p className="text-muted text-xs">
          Solo se cuentan y se muestran las ventas que cobraste tú. Las anuladas y las por validar
          no suman al total.
        </p>
      ) : (
        <p className="text-muted text-xs">
          Las ventas anuladas y las por validar no suman a las compras ni al total.
        </p>
      )}

      <h3 className="font-semibold">Historial de compras</h3>
      <CustomerSales rows={history.rows} />

      {history.page > 1 || history.hasNext ? (
        <nav aria-label="Paginación" className="flex items-center justify-between gap-2.5">
          {history.page > 1 ? (
            <Link
              href={history.page === 2 ? base : `${base}?pagina=${history.page - 1}`}
              className={BTN}
            >
              Anterior
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted text-sm">Página {history.page}</span>
          {history.hasNext ? (
            <Link href={`${base}?pagina=${history.page + 1}`} className={BTN}>
              Siguiente
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  )
}
