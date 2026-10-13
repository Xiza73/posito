import { cookies } from 'next/headers'
import { AppHeader } from '@/components/shell/app-header'
import { BottomTabs } from '@/components/shell/bottom-tabs'
import { Sidebar } from '@/components/shell/sidebar'
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
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)

  return (
    <div className="flex h-dvh overflow-hidden bg-page">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader today={formatToday()} theme={theme} />
        <main className="flex min-h-0 flex-1 flex-col overflow-auto pb-17 md:pb-0">{children}</main>
      </div>
      <BottomTabs />
    </div>
  )
}
