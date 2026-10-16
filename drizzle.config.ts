import { loadEnvConfig } from '@next/env'
import { defineConfig } from 'drizzle-kit'

// Mismo loader que Next: lee .env.local
loadEnvConfig(process.cwd())

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  casing: 'snake_case',
  // Migraciones por el session pooler (5432): el transaction pooler (6543) no mantiene la sesión
  dbCredentials: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '' },
})
