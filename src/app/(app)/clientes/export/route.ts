import { exportRows } from '@/features/clientes/data/customers'
import { toCsv } from '@/features/clientes/lib/csv'
import { exportFileName, parseCustomersSearchParams } from '@/features/clientes/lib/filters'
import { db } from '@/lib/db'
import { todayInLima } from '@/lib/lima-time'
import { seesAllSales } from '@/lib/permissions'
import { findCurrentMember } from '@/lib/session'

// Datos de la sesión y de la DB: nunca se cachea ni se prerrenderiza.
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * Exporta a CSV los clientes filtrados. SOLO administración (`report:view`, la misma regla que ver
 * todas las ventas): son datos personales (teléfono, correo, dirección) y un cajero no debe poder
 * llevárselos en bloque. Mismos filtros que la página (mismo esquema Zod); la bodega y el rol salen
 * de la sesión. Se usa findCurrentMember (no getCurrentMember) porque aquí no se redirige:
 * sin sesión -> 401; sin permiso -> 403.
 */
export async function GET(request: Request): Promise<Response> {
  const current = await findCurrentMember()
  if (!current) {
    return new Response('No autorizado', { status: 401, headers: NO_STORE })
  }
  if (!seesAllSales(current.member.role)) {
    return new Response('No tienes permiso para exportar clientes', {
      status: 403,
      headers: NO_STORE,
    })
  }

  const { searchParams } = new URL(request.url)
  // Quien exporta es admin/owner: puede incluir inactivos
  const { filters } = parseCustomersSearchParams(Object.fromEntries(searchParams), true)

  const { rows, truncated } = await exportRows(db, {
    orgId: current.organization.id,
    viewer: { userId: current.user.id, role: current.member.role },
    query: filters.query,
    includeInactive: filters.includeInactive,
  })

  return new Response(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${exportFileName(todayInLima())}"`,
      'Cache-Control': 'no-store',
      // Aviso para quien llame al endpoint: el archivo se cortó en el tope de filas
      ...(truncated ? { 'X-Export-Truncated': '1' } : {}),
    },
  })
}
