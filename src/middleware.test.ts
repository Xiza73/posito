// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { config } from './middleware'

// El matcher de Next es sintaxis path-to-regexp; esta expresión es su equivalente para rutas
// (`/` + grupo con lookahead). Si alguien toca el literal, estos casos fallan.
const matcher = config.matcher[0]
const matches = (path: string) => new RegExp(`^${matcher}$`).test(path)
// matches = el middleware CORRE (la ruta está protegida)

describe('middleware matcher', () => {
  it.each([
    '/tienda',
    '/tienda/mi-bodega',
    '/tienda/mi-bodega/p/11111111-1111-4111-8111-111111111111',
  ])('%s es pública', (path) => {
    expect(matches(path)).toBe(false)
  })

  it.each([
    '/',
    '/caja',
    '/ventas',
    '/configuracion',
    '/tiendas',
    '/tienda-admin',
    '/tienda-admin/x',
    '/tiendax/y',
    '/mas',
    '/loginx',
    '/login-admin',
    '/api/authx',
    '/api/authz/session',
  ])('%s sigue protegida', (path) => {
    expect(matches(path)).toBe(true)
  })

  it.each([
    '/login',
    '/login/olvide',
    '/api/auth',
    '/api/auth/session',
    '/api/auth/sign-in/email',
    '/_next/static/chunk.js',
    '/favicon.ico',
    '/logo.png',
  ])('%s queda fuera (login, auth, estáticos)', (path) => {
    expect(matches(path)).toBe(false)
  })
})
