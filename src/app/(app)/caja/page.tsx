import Link from 'next/link'
import { CajaScreen } from '@/features/caja/components/caja-screen'
import { getCatalog } from '@/features/caja/data/catalog'
import { can } from '@/lib/permissions'
import { getCurrentMember } from '@/lib/session'

export default async function CajaPage() {
  // La bodega sale de la sesión; el layout no basta (no se re-ejecuta en navegación cliente).
  const { member, organization } = await getCurrentMember()
  const { products, categories } = await getCatalog(organization.id)

  if (products.length === 0) {
    return (
      <div className="animate-fade-up p-4 md:px-7 md:py-6">
        <div className="rounded-card border border-line bg-surface p-8 text-center">
          <p className="text-muted text-sm">Aún no hay productos. Créalos en Productos.</p>
          {can(member.role, { product: ['create'] }) ? (
            <Link
              href="/productos"
              className="mt-4 inline-flex h-10 items-center rounded-ctl bg-accent px-4 font-semibold text-accent-ink text-sm"
            >
              Ir a Productos
            </Link>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <CajaScreen
      products={products}
      categories={categories}
      businessName={organization.name}
      canCreateCustomer={can(member.role, { customer: ['create'] })}
    />
  )
}
