import { getSessionCookie } from 'better-auth/cookies'
import { type NextRequest, NextResponse } from 'next/server'

// Chequeo OPTIMISTA: solo mira que exista la cookie de sesión. No valida la sesión.
// La verificación real (sesión + membresía en DB) vive en getCurrentMember(), llamado
// desde src/app/(app)/layout.tsx.
export function middleware(request: NextRequest) {
  if (!getSessionCookie(request)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return NextResponse.next()
}

export const config = {
  // Puntos escapados: sin `\\.` el lookahead excluía toda ruta de más de un carácter
  matcher: ['/((?!login|api/auth|_next|favicon\\.ico|.*\\.[a-zA-Z0-9]+$).*)'],
}
