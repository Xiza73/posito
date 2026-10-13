import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LoginForm } from '@/features/auth/components/login-form'
import { findCurrentMember, getOptionalSession } from '@/lib/session'

export const metadata: Metadata = { title: 'Ingresar · Ventalia POS' }

export default async function LoginPage() {
  // Solo con membresía real: con sesión pero sin bodega, redirigir crearía un bucle /login ↔ /caja
  if (await findCurrentMember()) redirect('/caja')
  const orphanSession = Boolean(await getOptionalSession())

  return (
    <main className="flex min-h-dvh flex-col items-center overflow-auto bg-page px-5 py-8">
      <div className="m-auto w-full max-w-105 animate-fade-up">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-3.5 size-11 rounded-ctl bg-accent" aria-hidden="true" />
          <h1 className="font-semibold text-[28px] tracking-tight">Ventalia</h1>
          <p className="mt-1 text-muted text-sm">Punto de venta para tu empresa</p>
        </div>
        <div className="rounded-card border border-line bg-surface p-7 shadow-pop">
          <h2 className="mb-5 font-semibold text-lg">Ingresar</h2>
          {orphanSession && (
            <p role="alert" className="mb-4 rounded-ctl bg-surface-2 p-3 text-sm text-warn">
              Tu usuario ya no pertenece a ninguna bodega. Pide acceso a un administrador.
            </p>
          )}
          <LoginForm />
        </div>
      </div>
    </main>
  )
}
