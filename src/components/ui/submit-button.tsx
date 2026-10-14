'use client'

import { useFormStatus } from 'react-dom'

type Props = Omit<React.ComponentProps<'button'>, 'type' | 'children'> & {
  children: React.ReactNode
  /** Texto mientras la acción está en curso. */
  pendingLabel: string
}

/**
 * Botón de envío para `<form action={...}>`: se deshabilita mientras la acción corre.
 * Usa `aria-disabled` además de `disabled` para que lectores de pantalla lo anuncien.
 */
export function SubmitButton({ children, pendingLabel, className, ...rest }: Props) {
  const { pending } = useFormStatus()
  return (
    <button
      {...rest}
      type="submit"
      disabled={pending || rest.disabled}
      aria-disabled={pending || rest.disabled}
      className={`cursor-pointer disabled:cursor-wait disabled:opacity-60 ${className ?? ''}`}
    >
      {pending ? pendingLabel : children}
    </button>
  )
}
