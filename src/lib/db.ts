import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '@/db/schema'

// prepare: false → requerido por el pooler de Supabase en transaction mode
const client = postgres(process.env.DATABASE_URL ?? '', { prepare: false })

export const db = drizzle(client, { schema, casing: 'snake_case' })
