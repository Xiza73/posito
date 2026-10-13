import { z } from 'zod'
import { ASSIGNABLE_ROLES } from '@/lib/permissions'

// `owner` no es asignable desde la UI: nace con la bodega (scripts/create-bodega.ts).
const roleSchema = z.enum(ASSIGNABLE_ROLES, { error: 'Elige un rol válido' })

export const createCashierSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(80, 'El nombre no puede pasar de 80 caracteres'),
  // trim/lowercase ANTES de validar el formato (en Zod 4 los checks corren en orden)
  email: z.string().trim().toLowerCase().pipe(z.email('Ingresa un correo válido')),
  password: z
    .string()
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(128, 'La contraseña no puede pasar de 128 caracteres'),
  role: roleSchema,
})

export const changeRoleSchema = z.object({
  memberId: z.string().min(1, 'Falta el miembro'),
  role: roleSchema,
})

export type CreateCashierInput = z.infer<typeof createCashierSchema>
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>
