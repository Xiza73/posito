// Dirección pública de la tienda: /tienda/<slug>. Única global, en minúsculas. El CHECK de la DB
// (`organization_settings_store_slug_format`) es la última red; aquí van los mensajes y los reservados.

export const STORE_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/

export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'login',
  'tienda',
  'caja',
  'ventas',
  'productos',
  'inventario',
  'clientes',
  'usuarios',
  'configuracion',
  'mas',
  'soporte',
  'ayuda',
  'www',
  'ventalia',
])

export const normalizeStoreSlug = (s: string) => s.trim().toLowerCase()

/** Mensaje de error en español, o null si el slug (ya normalizado) es válido. */
export function validateStoreSlug(slug: string): string | null {
  if (!STORE_SLUG_RE.test(slug) || slug.includes('--')) {
    return 'Usa de 3 a 40 caracteres: letras minúsculas, números y guiones (sin guion al inicio, al final ni dobles)'
  }
  if (RESERVED_SLUGS.has(slug)) return 'Esa dirección está reservada'
  return null
}
