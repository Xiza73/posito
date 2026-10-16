import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { StockBadge } from '@/components/ui/stock-badge'
import { MovementsList } from '@/features/inventario/components/movements-list'
import { PageLinks } from '@/features/inventario/components/page-links'
import { getStockItem, productMovements } from '@/features/inventario/data/inventory'
import { db } from '@/lib/db'
import { seesAllSales } from '@/lib/permissions'
import { getCurrentMember } from '@/lib/session'

type Props = {
  params: Promise<{ productId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const pageSchema = z.coerce.number().int().min(1).max(100_000).catch(1)

export default async function ProductoInventarioPage({ params, searchParams }: Props) {
  // Bodega y rol salen de la sesión; getStockItem devuelve null si es de otra bodega.
  const { member, organization, user } = await getCurrentMember()
  const id = z.uuid().safeParse((await params).productId)
  if (!id.success) notFound()

  const item = await getStockItem(db, { orgId: organization.id, productId: id.data })
  if (!item) notFound()

  const raw = (await searchParams).pagina
  const page = pageSchema.parse(Array.isArray(raw) ? raw[0] : raw)
  const list = await productMovements(db, { orgId: organization.id, productId: item.id, page })

  return (
    <div className="flex animate-fade-up flex-col gap-4 p-4 md:px-7 md:py-6">
      <Link href="/inventario" className="text-muted text-sm underline-offset-2 hover:underline">
        ← Inventario
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-line bg-surface p-5">
        <div className="min-w-0">
          <h2 className="font-semibold text-lg">
            {item.name}
            {item.active ? null : (
              <span className="ml-2 rounded-full border border-line px-2 py-0.5 font-normal text-muted text-xs">
                Inactivo
              </span>
            )}
          </h2>
          <p className="text-muted text-sm">
            {item.categoryName ?? 'Sin categoría'}
            {item.barcode ? <span className="font-mono"> · {item.barcode}</span> : null}
          </p>
        </div>
        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="text-muted text-xs">Stock</dt>
            <dd className="mt-0.5">
              {item.tracksStock ? (
                <StockBadge {...item} />
              ) : (
                <span className="text-muted text-xs">No controla stock</span>
              )}
            </dd>
          </div>
          {item.tracksStock ? (
            <div>
              <dt className="text-muted text-xs">Mínimo</dt>
              <dd className="mt-0.5 font-mono">{item.minStock}</dd>
            </div>
          ) : null}
        </dl>
      </header>

      <h3 className="font-semibold">Movimientos</h3>
      <MovementsList
        rows={list.rows}
        showProduct={false}
        viewer={{ userId: user.id, seesAllSales: seesAllSales(member.role) }}
      />
      <PageLinks
        page={list.page}
        hasNext={list.hasNext}
        hrefFor={(p) => (p > 1 ? `/inventario/${item.id}?pagina=${p}` : `/inventario/${item.id}`)}
      />
    </div>
  )
}
