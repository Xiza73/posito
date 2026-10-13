import { LogoutButton } from './logout-button'
import { SidebarNav } from './sidebar-nav'

export type ShellUser = {
  name: string
  initials: string
  roleLabel: string
  organizationName: string
  canManage: boolean
}

/** Escritorio >= 1024: sidebar 240px con etiquetas. Tablet 768-1023: rail de 72px solo íconos. */
export function Sidebar({ user }: { user: ShellUser }) {
  return (
    <aside className="hidden w-18 flex-none flex-col gap-1 border-line border-r bg-surface px-3 py-5 md:flex lg:w-60">
      <div className="flex items-center gap-2.5 px-2.5 pb-5">
        <div className="size-7.5 flex-none rounded-ctl bg-accent" aria-hidden="true" />
        <div className="hidden min-w-0 lg:block">
          <div className="truncate font-semibold text-[15px] leading-tight">
            {user.organizationName}
          </div>
          <div className="truncate text-muted text-xs">Ventalia POS</div>
        </div>
      </div>

      <nav aria-label="Principal">
        <SidebarNav canManage={user.canManage} />
      </nav>

      <div className="flex-1" />

      <div className="flex flex-col items-center gap-1 lg:items-stretch">
        <div className="flex items-center gap-2.5 p-2.5">
          <div
            className="grid size-8 flex-none place-items-center rounded-full bg-accent-soft font-semibold text-accent text-xs"
            title={user.name}
          >
            {user.initials}
          </div>
          <div className="hidden min-w-0 lg:block">
            <div className="truncate font-medium text-sm">{user.name}</div>
            <div className="truncate text-muted text-xs">{user.roleLabel}</div>
          </div>
        </div>
        <LogoutButton className="flex h-11 w-full cursor-pointer items-center justify-center gap-3 rounded-ctl px-2.5 font-medium text-muted text-sm transition-colors hover:bg-surface-2 lg:justify-start [&>span]:hidden lg:[&>span]:inline" />
      </div>
    </aside>
  )
}
