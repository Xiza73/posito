import { loadEnvConfig } from '@next/env'
import { defineConfig } from 'drizzle-kit'

// Mismo loader que Next: lee .env.local
loadEnvConfig(process.cwd())

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
})
