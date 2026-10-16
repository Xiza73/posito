import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Cada test de DB levanta un PGlite y aplica las migraciones; en paralelo supera los 10 s por defecto
    hookTimeout: 60_000,
  },
})
