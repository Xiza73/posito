// Alta de una bodega (invitación manual): crea el usuario propietario/a y la organization.
// Uso: bun run bodega:create -- --nombre "Bodega San Martín" --propietario "Ana Rojas" --email ana@bodega.pe
// Bun carga .env.local solo (DATABASE_URL, BETTER_AUTH_SECRET); la contraseña se pide por prompt.
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { slugify } from '@/lib/slug'
import { createUserWithPassword, deleteUserById } from '@/lib/users'

const argsSchema = z.object({
  nombre: z.string().trim().min(2, '--nombre: mínimo 2 caracteres').max(80),
  propietario: z.string().trim().min(2, '--propietario: mínimo 2 caracteres').max(80),
  email: z.string().trim().toLowerCase().pipe(z.email('--email: correo inválido')),
})
const passwordSchema = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128)

async function main() {
  const { values } = parseArgs({
    options: {
      nombre: { type: 'string' },
      propietario: { type: 'string' },
      email: { type: 'string' },
    },
  })

  const args = argsSchema.safeParse(values)
  if (!args.success) {
    for (const issue of args.error.issues) console.error(`- ${issue.message}`)
    console.error('\nUso: bun run bodega:create -- --nombre "…" --propietario "…" --email …')
    process.exit(1)
  }

  const slug = slugify(args.data.nombre)
  if (!slug) {
    console.error('- --nombre: debe contener letras o números')
    process.exit(1)
  }

  // La contraseña nunca viaja por argv ni se imprime.
  const password = passwordSchema.safeParse(prompt('Contraseña del propietario/a (mín. 8): '))
  if (!password.success) {
    console.error(`- ${password.error.issues[0]?.message ?? 'Contraseña inválida'}`)
    process.exit(1)
  }

  const user = await createUserWithPassword({
    name: args.data.propietario,
    email: args.data.email,
    password: password.data,
  })

  try {
    // Sin sesión: acción de sistema. El usuario queda como `owner` (creatorRole).
    const org = await auth.api.createOrganization({
      body: { name: args.data.nombre, slug, userId: user.id },
    })
    console.log('Bodega creada')
    console.log(`  Bodega:       ${org?.name} (${org?.slug})`)
    console.log(`  Propietario/a: ${user.name} <${user.email}>`)
  } catch (e) {
    await deleteUserById(user.id).catch(() => {}) // no dejar un usuario huérfano
    throw e
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('No se pudo crear la bodega:', e instanceof Error ? e.message : e)
    process.exit(1)
  })
