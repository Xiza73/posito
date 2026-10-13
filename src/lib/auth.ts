import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { organization } from 'better-auth/plugins'
import { asc, eq } from 'drizzle-orm'
import { member } from '@/db/schema'
import { db } from '@/lib/db'
import { ac, roles } from '@/lib/permissions'

// BETTER_AUTH_URL y BETTER_AUTH_SECRET los lee Better Auth del entorno.
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  // Sin registro público: los usuarios se crean con scripts/create-bodega.ts o desde Usuarios.
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 8 },
  databaseHooks: {
    session: {
      create: {
        // Una organization = una bodega: la sesión nace con la primera membresía activa.
        before: async (session) => {
          const [first] = await db
            .select({ organizationId: member.organizationId })
            .from(member)
            .where(eq(member.userId, session.userId))
            .orderBy(asc(member.createdAt))
            .limit(1)
          return { data: { ...session, activeOrganizationId: first?.organizationId ?? null } }
        },
      },
    },
  },
  plugins: [
    organization({
      // Borrar una bodega con todas sus ventas no debe ser posible vía API
      disableOrganizationDeletion: true,
      ac,
      roles,
      allowUserToCreateOrganization: false,
      creatorRole: 'owner',
    }),
    nextCookies(), // siempre el último plugin
  ],
})
