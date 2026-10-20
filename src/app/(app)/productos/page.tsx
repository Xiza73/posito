import { z } from 'zod'
import { ProductosTabs } from '@/features/productos/components/productos-tabs'
import { ProductsView } from '@/features/productos/components/products-view'
import { listCategoriesWithCounts, listProducts } from '@/features/productos/data/products'
import { db } from '@/lib/db'
import { can, seesProductCost } from '@/lib/permissions'
import { publicImageBase } from '@/lib/product-image'
import { getCurrentMember } from '@/lib/session'

type SearchParams = Promise<{ q?: string; categoria?: string; inactivos?: string }>

export default async function ProductosPage({ searchParams }: { searchParams: SearchParams }) {
  // La bodega sale de la sesión; el layout no basta (no se re-ejecuta en navegación cliente).
  const { member, organization } = await getCurrentMember()
  const sp = await searchParams

  const perms = {
    create: can(member.role, { product: ['create'] }),
    update: can(member.role, { product: ['update'] }),
    delete: can(member.role, { product: ['delete'] }),
  }
  // El costo solo se consulta y viaja al cliente para quien lo ve (owner/admin); el cajero ni lo recibe
  const showCost = seesProductCost(member.role)
  const query = typeof sp.q === 'string' ? sp.q.slice(0, 80) : ''
  const categoryId = z.uuid().safeParse(sp.categoria).data ?? ''
  // Ver inactivos solo tiene sentido para quien puede reactivarlos
  const includeInactive = perms.update && sp.inactivos === '1'

  const [products, categories] = await Promise.all([
    listProducts(db, organization.id, {
      includeInactive,
      includeCost: showCost,
      query,
      categoryId: categoryId || undefined,
    }),
    listCategoriesWithCounts(db, organization.id),
  ])

  return (
    <div className="flex animate-fade-up flex-col gap-4 p-4 md:px-7 md:py-6">
      <h2 className="font-semibold text-lg">Productos</h2>
      <ProductosTabs active="productos" showCategories={perms.update} />
      <ProductsView
        products={products}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        filters={{ query, categoryId, includeInactive }}
        perms={perms}
        showCost={showCost}
        imageBase={publicImageBase(process.env.SUPABASE_URL)}
      />
    </div>
  )
}
