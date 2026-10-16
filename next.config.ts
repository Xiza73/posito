import type { NextConfig } from 'next'

// Cabeceras de seguridad para todas las rutas. HSTS lo pone Vercel en sus dominios.
const securityHeaders = [
  // Nadie puede embeber la app en un iframe (clickjacking sobre el botón Cobrar)
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Cámara solo para la propia app (futuro escaneo de códigos); nada de micrófono ni ubicación
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

export default nextConfig
