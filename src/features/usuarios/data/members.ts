import 'server-only'
import { asc, eq } from 'drizzle-orm'
import { member, user } from '@/db/schema'
import { db } from '@/lib/db'

export type MemberRow = {
  id: string
  userId: string
  name: string
  email: string
  role: string
  createdAt: Date
}

/** Miembros de la bodega (organization) indicada; el id sale SIEMPRE de la sesión. */
export async function listMembers(organizationId: string): Promise<MemberRow[]> {
  return db
    .select({
      id: member.id,
      userId: member.userId,
      name: user.name,
      email: user.email,
      role: member.role,
      createdAt: member.createdAt,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, organizationId))
    .orderBy(asc(member.createdAt))
}
