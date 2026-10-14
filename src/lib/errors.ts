/** redirect()/notFound() de Next lanzan errores con `digest` que no deben tragarse. */
export function isNextControlFlow(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'digest' in e &&
    typeof e.digest === 'string' &&
    e.digest.startsWith('NEXT_')
  )
}

type PgLike = { code?: unknown; constraint_name?: unknown; constraint?: unknown; cause?: unknown }

/**
 * Si el error (o su `cause`) es una violación de unicidad de Postgres (SQLSTATE 23505),
 * devuelve el nombre del índice/constraint (o '' si el driver no lo expone); si no, null.
 * Drizzle envuelve el error del driver en `cause`; postgres.js usa `constraint_name`
 * y PGlite `constraint`.
 */
export function uniqueViolation(e: unknown): string | null {
  let cur: unknown = e
  for (let depth = 0; depth < 5 && typeof cur === 'object' && cur !== null; depth++) {
    const err = cur as PgLike
    if (err.code === '23505') {
      const name = err.constraint_name ?? err.constraint
      return typeof name === 'string' ? name : ''
    }
    cur = err.cause
  }
  return null
}
