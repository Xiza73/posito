import { exportStockRows } from '@/features/inventario/data/inventory'
import { stockToCsv } from '@/features/inventario/lib/csv'
import { parseStockSearchParams, stockExportFileName } from '@/features/inventario/lib/filters'
import { db } from '@/lib/db'
import { todayInLima } from '@/lib/lima-time'
import { can } from '@/lib/permissions'
import { findCurrentMember } from '@/lib/session'

// Datos de la sesión y de la DB: nunca se cachea ni se prerrenderiza.
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * Exporta a CSV el inventario filtrado. Mismos filtros que la página (mismo esquema Zod); la bodega
 * y el rol salen de la sesión. Cualquier miembro puede exportar lo que ve; los inactivos solo
 * los incluye quien puede gestionar el stock. Se usa findCurrentMember (no getCurrentMember)
 * porque aquí no se redirige: sin sesión -> 401.
 */
export async function GET(request: Request): Promise<Response> {
  const current = await findCurrentMember()
  if (!current) {
    return new Response('No autorizado', { status: 401, headers: NO_STORE })
  }

  const { searchParams } = new URL(request.url)
  const canSeeInactive = can(current.member.role, { stock: ['adjust'] })
  const filters = parseStockSearchParams(Object.fromEntries(searchParams), canSeeInactive)

  const rows = await exportStockRows(db, { orgId: current.organization.id, filters })

  return new Response(stockToCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${stockExportFileName(todayInLima())}"`,
      'Cache-Control': 'no-store',
    },
  })
}
