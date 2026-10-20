import { createAccessControl } from 'better-auth/plugins/access'
import { adminAc, defaultStatements, ownerAc } from 'better-auth/plugins/organization/access'

// Módulo compartido servidor/cliente: sin imports de servidor.
export const statements = {
  ...defaultStatements,
  product: ['create', 'update', 'delete'],
  // 'delete' = desactivar (los clientes no se borran)
  customer: ['create', 'update', 'delete'],
  stock: ['adjust'],
  sale: ['void', 'approve'],
  report: ['view'],
} as const

export const ac = createAccessControl(statements)

const business = {
  product: ['create', 'update', 'delete'],
  customer: ['create', 'update', 'delete'],
  stock: ['adjust'],
  sale: ['void', 'approve'],
  report: ['view'],
} as const

export const roles = {
  owner: ac.newRole({ ...ownerAc.statements, ...business }),
  admin: ac.newRole({ ...adminAc.statements, ...business }),
  // El cajero usa la caja y registra/corrige clientes; no desactiva ni tiene otros permisos de
  // negocio ni gestión de miembros.
  cajero: ac.newRole({ customer: ['create', 'update'] }),
}

export type RoleName = keyof typeof roles

export const ROLE_LABELS: Record<RoleName, string> = {
  owner: 'Propietario/a',
  admin: 'Administrador/a',
  cajero: 'Cajero/a',
}

/** Roles asignables desde Usuarios: el propietario/a solo nace con la bodega. */
export const ASSIGNABLE_ROLES = ['admin', 'cajero'] as const
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

export function roleLabel(role: string): string {
  return role in ROLE_LABELS ? ROLE_LABELS[role as RoleName] : role
}

/** Chequeo puro (sin DB) por rol; para ocultar UI. La autoridad real es el servidor. */
export function can(role: string, request: Parameters<(typeof roles)['admin']['authorize']>[0]) {
  return role in roles && roles[role as RoleName].authorize(request).success
}

/** Ve las ventas de todos (lista, detalle, totales, CSV). UNA sola regla para la UI y los datos. */
export const seesAllSales = (role: string) => can(role, { report: ['view'] })

/**
 * Ve y edita el costo de los productos. Usa `product:update`: solo owner/admin lo tienen (el cajero
 * no), así que no hace falta un permiso nuevo. UNA sola regla para la UI y la capa de datos.
 */
export const seesProductCost = (role: string) => can(role, { product: ['update'] })
