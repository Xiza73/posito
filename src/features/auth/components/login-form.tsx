'use client'

import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { authClient } from '@/lib/auth-client'

const INPUT =
  'h-11.5 rounded-ctl border border-line bg-page px-3.5 text-ink outline-none focus-visible:border-accent'

export function LoginForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setPending(true)
    setError(null)
    const { error } = await authClient.signIn.email({
      email: String(form.get('email') ?? '').trim(),
      password: String(form.get('password') ?? ''),
    })
    if (error) {
      setError('Correo o contraseña incorrectos')
      setPending(false)
      return
    }
    router.replace('/caja')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5" noValidate>
      <label className="flex flex-col gap-1.5 text-muted text-sm">
        Correo
        <input
          name="email"
          type="email"
          autoComplete="username"
          placeholder="ana@tuempresa.pe"
          required
          className={INPUT}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-muted text-sm">
        Contraseña
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          className={INPUT}
        />
      </label>

      {error ? (
        <p role="alert" className="text-bad text-sm">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-1.5 h-12 cursor-pointer rounded-ctl bg-accent font-semibold text-accent-ink transition-opacity disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  )
}
