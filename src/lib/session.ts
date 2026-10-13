import 'server-only'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { cache } from 'react'
import { member, organization } from '@/db/schema'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

/**
 * Sesión + membresía de la bodega activa. Redirige a /login si no hay sesión válida.
 * Es la verificación real; el middleware solo hace un chequeo optimista de cookie.
 */
export const getCurrentMember = cache(async () => {
  const current = await findCurrentMember()
  // Sesión válida sin membresía (lo quitaron de la bodega): /login muestra el aviso y no rebota
  if (!current) redirect('/login')
  return current
})

/** Igual que getCurrentMember pero devuelve null en vez de redirigir (para /login). */
export const findCurrentMember = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() })
  const organizationId = session?.session.activeOrganizationId
  if (!session || !organizationId) return null

  const [row] = await db
    .select({
      memberId: member.id,
      role: member.role,
      organizationName: organization.name,
    })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, session.user.id), eq(member.organizationId, organizationId)))
    .limit(1)
  if (!row) return null

  return {
    user: session.user,
    session: session.session,
    member: { id: row.memberId, role: row.role },
    organization: { id: organizationId, name: row.organizationName },
  }
})

/** Sesión opcional, sin redirigir (para /login). */
export async function getOptionalSession() {
  return auth.api.getSession({ headers: await headers() })
}

export type Permissions = Record<string, string[]>

/** `true` si el rol del usuario en la bodega activa tiene todos los permisos pedidos. */
export async function hasPermission(permissions: Permissions): Promise<boolean> {
  try {
    const res = await auth.api.hasPermission({ headers: await headers(), body: { permissions } })
    return res.success
  } catch {
    return false
  }
}

/** Lanza si no tiene el permiso. Para Server Actions: capturar y devolver `{ ok: false }`. */
export async function requirePermission(permissions: Permissions): Promise<void> {
  if (!(await hasPermission(permissions))) throw new ForbiddenError()
}

export class ForbiddenError extends Error {
  constructor() {
    super('No tienes permiso para realizar esta acción')
    this.name = 'ForbiddenError'
  }
}
