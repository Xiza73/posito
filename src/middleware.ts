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
  // Puntos escapados: sin `\\.` el lookahead excluía toda ruta de más de un carácter.
  // `tienda` es PÚBLICA (catálogo sin login): se excluye EXACTAMENTE `/tienda` y `/tienda/...`
  // (`(?:/|$)`), así `/tiendas` o `/tienda-admin` siguen protegidas. Debe ser un literal (Next lo
  // analiza estáticamente); middleware.test.ts lo prueba como regex. `login` y `api/auth` también
  // exigen `/` o fin: `/loginx` y `/api/authx` NO quedan excluidas.
  // TODO ruta bajo `/tienda/` es PÚBLICA: jamás agregar páginas internas ahí.
  matcher: [
    '/((?!login(?:/|$)|api/auth(?:/|$)|tienda(?:/|$)|_next|favicon\\.ico|.*\\.[a-zA-Z0-9]+$).*)',
  ],
}
