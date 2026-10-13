'use server'

import { and, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { member } from '@/db/schema'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ForbiddenError, getCurrentMember, requirePermission } from '@/lib/session'
import { createUserWithPassword, deleteUserById, EmailTakenError } from '@/lib/users'
import { changeRoleSchema, createCashierSchema } from './lib/schemas'

export type FormState = {
  ok: boolean
  message?: string
  error?: string
  fieldErrors?: Record<string, string[] | undefined>
  /** Valores enviados (sin contraseña) para repoblar el formulario tras un error. */
  values?: { name: string; email: string; role: string }
}

const GENERIC_ERROR = 'No se pudo completar la acción. Inténtalo de nuevo.'

/** redirect()/notFound() de Next lanzan errores con `digest` que no deben tragarse. */
function isNextControlFlow(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'digest' in e &&
    typeof e.digest === 'string' &&
    e.digest.startsWith('NEXT_')
  )
}

export async function createCashier(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = createCashierSchema.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    role: formData.get('role'),
  })
  const values = {
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
    role: String(formData.get('role') ?? 'cajero'),
  }
  if (!parsed.success) {
    return { ok: false, values, fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  let createdUserId: string | null = null
  try {
    // La bodega sale de la sesión, nunca del formulario.
    const { organization } = await getCurrentMember()
    await requirePermission({ member: ['create'] })

    const user = await createUserWithPassword(parsed.data)
    createdUserId = user.id

    await auth.api.addMember({
      body: { userId: user.id, organizationId: organization.id, role: parsed.data.role },
    })
    createdUserId = null // alta completa: ya no hay nada que deshacer
  } catch (e) {
    if (createdUserId) {
      // sin huérfanos; si el rollback falla, que quede registrado para limpiarlo a mano
      await deleteUserById(createdUserId).catch((err) =>
        console.error('[usuarios] rollback falló, usuario huérfano:', createdUserId, err),
      )
    }
    if (isNextControlFlow(e)) throw e
    if (e instanceof ForbiddenError) return { ok: false, values, error: e.message }
    if (e instanceof EmailTakenError) {
      return { ok: false, values, fieldErrors: { email: ['Ya existe un usuario con ese correo'] } }
    }
    console.error('[usuarios] createCashier falló', e)
    return { ok: false, values, error: GENERIC_ERROR }
  }

  revalidatePath('/usuarios')
  return { ok: true, message: `Usuario ${parsed.data.name} creado` }
}

export async function changeRole(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = changeRoleSchema.safeParse({
    memberId: formData.get('memberId'),
    role: formData.get('role'),
  })
  if (!parsed.success) {
    return { ok: false, error: z.flattenError(parsed.error).fieldErrors.role?.[0] ?? GENERIC_ERROR }
  }

  try {
    const current = await getCurrentMember()
    await requirePermission({ member: ['update'] })

    if (parsed.data.memberId === current.member.id) {
      return { ok: false, error: 'No puedes cambiar tu propio rol' }
    }
    const [target] = await db
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.id, parsed.data.memberId),
          eq(member.organizationId, current.organization.id),
        ),
      )
      .limit(1)
    if (!target) return { ok: false, error: 'No se encontró al usuario' }
    if (target.role.split(',').includes('owner')) {
      return { ok: false, error: 'No se puede cambiar el rol del propietario/a' }
    }

    // Better Auth vuelve a validar permisos (member:update) con la sesión.
    await auth.api.updateMemberRole({
      headers: await headers(),
      body: { memberId: parsed.data.memberId, role: parsed.data.role },
    })
  } catch (e) {
    if (isNextControlFlow(e)) throw e
    if (e instanceof ForbiddenError) return { ok: false, error: e.message }
    console.error('[usuarios] changeRole falló', e)
    return { ok: false, error: GENERIC_ERROR }
  }

  revalidatePath('/usuarios')
  return { ok: true, message: 'Rol actualizado' }
}
