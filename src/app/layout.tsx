import type { Metadata } from 'next'
import { DM_Mono, Manrope } from 'next/font/google'
import { cookies } from 'next/headers'
import { parseTheme, THEME_COOKIE } from '@/lib/theme'
import './globals.css'

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
})

const dmMono = DM_Mono({
  variable: '--font-dm-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
})

export const metadata: Metadata = {
  title: 'Ventalia POS',
  description: 'Punto de venta multiempresa',
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value)

  return (
    <html lang="es" data-theme={theme}>
      <body className={`${manrope.variable} ${dmMono.variable} font-sans text-[15px]`}>
        {children}
      </body>
    </html>
  )
}
