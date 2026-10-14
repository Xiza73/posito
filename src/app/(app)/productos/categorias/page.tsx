import { NoPermission } from '@/components/ui/no-permission'
import { CategoriesList } from '@/features/productos/components/categories-list'
import { ProductosTabs } from '@/features/productos/components/productos-tabs'
import { listCategoriesWithCounts } from '@/features/productos/data/products'
import { db } from '@/lib/db'
import { can } from '@/lib/permissions'
import { getCurrentMember } from '@/lib/session'

export default async function CategoriasPage() {
  const { member, organization } = await getCurrentMember()
  // Guard de servidor: ocultar la pestaña no basta, la ruta se pide directo.
  if (!can(member.role, { product: ['update'] })) return <NoPermission title="Categorías" />

  const categories = await listCategoriesWithCounts(db, organization.id)

  return (
    <div className="flex animate-fade-up flex-col gap-4 p-4 md:px-7 md:py-6">
      <h2 className="font-semibold text-lg">Productos</h2>
      <ProductosTabs active="categorias" showCategories />
      <CategoriesList
        categories={categories}
        canCreate={can(member.role, { product: ['create'] })}
      />
    </div>
  )
}
