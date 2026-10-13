'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Icon } from '@/components/ui/icon'
import { authClient } from '@/lib/auth-client'

const LOGOUT_ICON = 'M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4M16 8l4 4-4 4M20 12H9'

export function LogoutButton({
  className,
  showLabel = true,
}: {
  className?: string
  showLabel?: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function onClick() {
    setPending(true)
    await authClient.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label="Cerrar sesión"
      title="Cerrar sesión"
      className={className}
    >
      <Icon d={LOGOUT_ICON} />
      {showLabel ? <span>{pending ? 'Saliendo…' : 'Cerrar sesión'}</span> : null}
    </button>
  )
}
