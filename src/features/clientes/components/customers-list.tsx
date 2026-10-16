import Link from 'next/link'
import { formatDocument } from '@/lib/document'
import { formatCents } from '@/lib/format'
import { initials } from '@/lib/initials'
import type { CustomerListRow } from '../data/customers'
import { formatLimaDate, purchasesLabel } from '../lib/format'

const TH = 'px-4 py-3 font-medium'

function InactiveTag() {
  return (
    <span className="ml-2 rounded-full border border-line px-2 py-0.5 font-normal text-muted text-xs">
      Inactivo
    </span>
  )
}

function Avatar({ name }: { name: string }) {
  return (
    <div
      aria-hidden="true"
      className="grid size-9 flex-none place-items-center rounded-full bg-accent-soft font-semibold text-accent text-xs"
    >
      {initials(name)}
    </div>
  )
}

const docOf = (c: CustomerListRow) =>
  c.documentType && c.documentNumber ? formatDocument(c.documentType, c.documentNumber) : null

/** Tabla en md+ y tarjetas en móvil. Cada cliente lleva a su perfil. */
export function CustomersList({ rows }: { rows: CustomerListRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-card border border-line bg-surface p-8 text-center text-muted text-sm">
        No hay clientes para mostrar.
      </p>
    )
  }

  return (
    <>
      <table className="hidden w-full overflow-hidden rounded-card border border-line bg-surface text-left text-sm md:table">
        <thead className="bg-surface-2 text-muted">
          <tr>
            <th scope="col" className={TH}>
              Cliente
            </th>
            <th scope="col" className={TH}>
              Documento
            </th>
            <th scope="col" className={TH}>
              Teléfono
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Compras
            </th>
            <th scope="col" className={TH}>
              Última compra
            </th>
            <th scope="col" className={`${TH} text-right`}>
              Total gastado
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr
              key={c.id}
              className={`border-line border-t hover:bg-surface-2 ${c.active ? '' : 'opacity-60'}`}
            >
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <Avatar name={c.name} />
                  <Link
                    href={`/clientes/${c.id}`}
                    className="font-medium text-accent underline-offset-2 hover:underline"
                  >
                    {c.name}
                  </Link>
                  {c.active ? null : <InactiveTag />}
                </div>
              </td>
              <td className="px-4 py-3 font-mono text-xs">{docOf(c) ?? '—'}</td>
              <td className="px-4 py-3 text-muted">{c.phone ?? '—'}</td>
              <td className="px-4 py-3 text-right font-mono">{c.purchaseCount}</td>
              <td className="px-4 py-3 text-muted">
                {c.lastPurchaseAt ? formatLimaDate(c.lastPurchaseAt) : '—'}
              </td>
              <td className="px-4 py-3 text-right font-mono">{formatCents(c.totalSpentCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="flex flex-col gap-2.5 md:hidden">
        {rows.map((c) => (
          <li key={c.id}>
            <Link
              href={`/clientes/${c.id}`}
              className={`flex items-center gap-3 rounded-card border border-line bg-surface p-4 ${
                c.active ? '' : 'opacity-60'
              }`}
            >
              <Avatar name={c.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {c.name}
                  {c.active ? null : <InactiveTag />}
                </div>
                <div className="truncate text-muted text-xs">
                  <span className="font-mono">{docOf(c) ?? 'Sin documento'}</span>
                  {c.phone ? ` · ${c.phone}` : ''}
                </div>
                <div className="text-muted text-xs">
                  {purchasesLabel(c.purchaseCount)}
                  {c.lastPurchaseAt ? ` · última ${formatLimaDate(c.lastPurchaseAt)}` : ''}
                </div>
              </div>
              <span className="flex-none font-mono text-sm">{formatCents(c.totalSpentCents)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
