export const RATE_LIMITED_MESSAGE = 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.'
export const INVALID_CREDENTIALS_MESSAGE = 'Correo o contraseña incorrectos'

// better-fetch (authClient) expone el estado HTTP en `error.status`; 429 = rate limit de Better Auth.
export function loginErrorMessage(error: { status?: number } | null | undefined): string {
  return error?.status === 429 ? RATE_LIMITED_MESSAGE : INVALID_CREDENTIALS_MESSAGE
}
