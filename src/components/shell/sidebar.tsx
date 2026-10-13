import { SidebarNav } from './sidebar-nav'

/** Escritorio >= 1024: sidebar 240px con etiquetas. Tablet 768-1023: rail de 72px solo íconos. */
export function Sidebar() {
  return (
    <aside className="hidden w-18 flex-none flex-col gap-1 border-line border-r bg-surface px-3 py-5 md:flex lg:w-60">
      <div className="flex items-center gap-2.5 px-2.5 pb-5">
        <div className="size-7.5 flex-none rounded-ctl bg-accent" aria-hidden="true" />
        <div className="hidden min-w-0 lg:block">
          <div className="font-semibold text-[15px] leading-tight">Bodega San Martín</div>
          <div className="truncate text-muted text-xs">Sucursal Centro</div>
        </div>
      </div>

      <nav aria-label="Principal">
        <SidebarNav />
      </nav>

      <div className="flex-1" />

      <div className="flex items-center gap-2.5 p-2.5">
        <div className="grid size-8 flex-none place-items-center rounded-full bg-accent-soft font-semibold text-accent text-xs">
          AR
        </div>
        <div className="hidden min-w-0 lg:block">
          <div className="font-medium text-sm">Ana Rojas</div>
          <div className="text-muted text-xs">Administradora</div>
        </div>
      </div>
    </aside>
  )
}
