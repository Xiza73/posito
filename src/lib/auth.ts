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
  // Cookie firmada con la sesión: evita un viaje a la DB (Lima -> São Paulo) en cada navegación.
  // Costo: una sesión revocada sigue válida hasta 5 min. La membresía/rol NO depende de esto:
  // getCurrentMember() y hasPermission() consultan `member` en la DB en cada request, así que
  // quitar a alguien de la bodega o cambiarle el rol surte efecto de inmediato.
  // Rate limit en la DB (tabla rate_limit): en Vercel cada instancia tiene su propia memoria y el
  // contador en memoria casi no frena la fuerza bruta. Clave = IP normalizada + ruta (no por correo).
  // Activo en TODOS los entornos (por defecto solo en producción).
  rateLimit: {
    enabled: true,
    storage: 'database',
    window: 60,
    max: 100,
    customRules: {
      '/sign-in/email': { window: 60, max: 5 },
      '/change-password': { window: 60, max: 5 },
      '/set-password': { window: 60, max: 5 },
      '/change-email': { window: 60, max: 5 },
    },
  },
  // Vercel pisa estos headers con la IP real del cliente (un solo valor). Con el default
  // (solo x-forwarded-for) y varios valores en la cadena Better Auth no resuelve IP y mete a todos en
  // un único bucket compartido por ruta.
  advanced: {
    ipAddress: { ipAddressHeaders: ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for'] },
  },
  session: { cookieCache: { enabled: true, maxAge: 5 * 60 } },
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
