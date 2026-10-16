// Sin `import 'server-only'`: scripts/create-bodega.ts (bun, fuera de Next) importa este módulo.
// Solo debe importarse desde código de servidor o scripts; nunca desde componentes cliente.
import { auth } from '@/lib/auth'

export class EmailTakenError extends Error {
  constructor() {
    super('Ya existe un usuario con ese correo')
    this.name = 'EmailTakenError'
  }
}

/**
 * Crea un usuario con credenciales (correo + contraseña) sin sesión.
 * `auth.api.signUpEmail` está bloqueado por `disableSignUp`, así que se usan las mismas
 * primitivas internas que el sign-up de Better Auth.
 */
export async function createUserWithPassword(input: {
  name: string
  email: string
  password: string
}) {
  const ctx = await auth.$context
  const email = input.email.toLowerCase()

  if (await ctx.internalAdapter.findUserByEmail(email)) throw new EmailTakenError()

  const hash = await ctx.password.hash(input.password)
  const user = await ctx.internalAdapter.createUser(
    { email, name: input.name, emailVerified: false },
    { method: 'email-password' },
  )
  try {
    await ctx.internalAdapter.linkAccount({
      userId: user.id,
      providerId: 'credential',
      accountId: user.id,
      password: hash,
    })
  } catch (err) {
    // Sin cuenta no puede entrar y el correo quedaría bloqueado: deshacer el usuario
    await ctx.internalAdapter.deleteUser(user.id)
    throw err
  }
  return user
}

/** Borra un usuario (y sus cuentas/sesiones). Se usa para deshacer altas a medias. */
export async function deleteUserById(userId: string) {
  const ctx = await auth.$context
  await ctx.internalAdapter.deleteUser(userId)
}
