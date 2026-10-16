import { cookies } from 'next/headers'
import { AppHeader } from '@/components/shell/app-header'
import { BottomTabs } from '@/components/shell/bottom-tabs'
import { PendingSalesProvider } from '@/components/shell/pending-badge'
import { Sidebar } from '@/components/shell/sidebar'
import { initials } from '@/lib/initials'
import { can, roleLabel } from '@/lib/permissions'
import { getCurrentMember } from '@/lib/session'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'

function formatToday() {
  const s = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'America/Lima',
  }).format(new Date())
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Verificación real de sesión + membresía (el middleware solo hace un chequeo optimista).
  const { user, member, organization } = await getCurrentMember()
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)

  return (
    <PendingSalesProvider enabled={can(member.role, { sale: ['approve'] })}>
      <div className="flex h-dvh overflow-hidden bg-page">
        <Sidebar
          user={{
            name: user.name,
            initials: initials(user.name),
            roleLabel: roleLabel(member.role),
            organizationName: organization.name,
            canManage: can(member.role, { member: ['create'] }),
          }}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader today={formatToday()} theme={theme} />
          <main className="flex min-h-0 flex-1 flex-col overflow-auto pb-17 md:pb-0">
            {children}
          </main>
        </div>
        <BottomTabs />
      </div>
    </PendingSalesProvider>
  )
}
