import type { PgDatabase } from 'drizzle-orm/pg-core'
import type * as schema from '@/db/schema'

// Las funciones de datos reciben `db` (o una transacción) para poder probarlas con PGlite.
// biome-ignore lint/suspicious/noExplicitAny: el HKT del resultado difiere entre postgres-js y PGlite
export type Db = PgDatabase<any, typeof schema>
