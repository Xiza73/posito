import { exportRows } from '@/features/ventas/data/sales'
import { toCsv } from '@/features/ventas/lib/csv'
import { exportFileName, parseSalesSearchParams } from '@/features/ventas/lib/filters'
import { db } from '@/lib/db'
import { findCurrentMember } from '@/lib/session'

// Datos de la sesión y de la DB: nunca se cachea ni se prerrenderiza.
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * Exporta a CSV las ventas filtradas. Mismos filtros que la página (mismo esquema Zod) y mismo
 * alcance: la bodega y el rol salen de la sesión; un cajero solo exporta sus ventas.
 * Se usa findCurrentMember (no getCurrentMember) porque aquí no se redirige: sin sesión -> 401.
 */
export async function GET(request: Request): Promise<Response> {
  const current = await findCurrentMember()
  if (!current) {
    return new Response('No autorizado', { status: 401, headers: NO_STORE })
  }

  const { searchParams } = new URL(request.url)
  const { filters } = parseSalesSearchParams(Object.fromEntries(searchParams))

  const { rows, truncated } = await exportRows(db, {
    orgId: current.organization.id,
    viewer: { userId: current.user.id, role: current.member.role },
    filters,
  })

  return new Response(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFileName(filters)}"`,
      'Cache-Control': 'no-store',
      // Aviso para quien llame al endpoint: el archivo se cortó en el tope de filas
      ...(truncated ? { 'X-Export-Truncated': '1' } : {}),
    },
  })
}
