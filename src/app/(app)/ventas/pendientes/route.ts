import { countPendingSales } from '@/features/ventas/data/sales'
import { db } from '@/lib/db'
import { can } from '@/lib/permissions'
import { findCurrentMember } from '@/lib/session'

// Datos de la sesión y de la DB: nunca se cachea ni se prerrenderiza.
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/**
 * Cantidad de ventas por validar, para el contador del menú (se consulta al navegar y cada ~30 s).
 * Sin sesión -> 401. Quien no puede aprobar recibe 0 sin consultar la DB: el contador es solo
 * para quien actúa sobre él. (Aquí se enchufaría un canal en tiempo real: SSE/WebSocket o push.)
 */
export async function GET(): Promise<Response> {
  const current = await findCurrentMember()
  if (!current) return Response.json({ error: 'No autorizado' }, { status: 401, headers: NO_STORE })

  const count = can(current.member.role, { sale: ['approve'] })
    ? await countPendingSales(db, current.organization.id)
    : 0
  return Response.json({ count }, { headers: NO_STORE })
}
