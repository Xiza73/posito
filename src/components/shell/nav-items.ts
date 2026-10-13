export type NavItem = {
  href: string
  label: string
  icon: string
}

export const ICONS = {
  inicio: 'M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z',
  caja: 'M3 7h18v12H3zM3 11h18M7 15h3',
  ventas: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  productos: 'M4 7l8-4 8 4v10l-8 4-8-4zM4 7l8 4 8-4M12 11v10',
  inventario: 'M4 5h16v4H4zM4 11h16v4H4zM4 17h16v4H4z',
  clientes: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  usuarios:
    'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 4a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.7',
  configuracion:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2.1-1.2L14 3h-4l-.4 2.6a7 7 0 0 0-2.1 1.2l-2.3-1-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2.1 1.2L10 21h4l.4-2.6a7 7 0 0 0 2.1-1.2l2.3 1 2-3.4-2-1.5c.1-.4.2-.8.2-1.3z',
  mas: 'M5 12h.01M12 12h.01M19 12h.01',
} as const

const item = (key: keyof typeof ICONS, href: string, label: string): NavItem => ({
  href,
  label,
  icon: ICONS[key],
})

export const NAV_ITEMS: NavItem[] = [
  item('inicio', '/', 'Inicio'),
  item('caja', '/caja', 'Caja'),
  item('ventas', '/ventas', 'Ventas'),
  item('productos', '/productos', 'Productos'),
  item('inventario', '/inventario', 'Inventario'),
  item('clientes', '/clientes', 'Clientes'),
  item('usuarios', '/usuarios', 'Usuarios'),
  item('configuracion', '/configuracion', 'Configuración'),
]

const byHref = (href: string) => NAV_ITEMS.find((n) => n.href === href) as NavItem

/** Barra inferior móvil: Caja, Ventas, Productos, Más. */
export const TAB_ITEMS: NavItem[] = [
  byHref('/caja'),
  byHref('/ventas'),
  byHref('/productos'),
  item('mas', '/mas', 'Más'),
]

/** Destinos que cuelgan de "Más" en móvil. */
export const MORE_ITEMS: NavItem[] = [
  byHref('/'),
  byHref('/inventario'),
  byHref('/clientes'),
  byHref('/usuarios'),
  byHref('/configuracion'),
]

export function isActive(pathname: string, href: string, group?: string[]): boolean {
  if (href === '/mas') {
    return pathname === '/mas' || (group ?? []).some((h) => isActive(pathname, h))
  }
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}

export function titleFor(pathname: string): string {
  if (pathname === '/mas') return 'Más'
  return NAV_ITEMS.find((n) => isActive(pathname, n.href))?.label ?? 'Ventalia'
}
