// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'

// Valor nuevo de enum ('pendiente') + `drizzle-orm` migrator.
//
// Evidencia (node_modules/drizzle-orm/pg-core/dialect.js, PgDialect.migrate): TODAS las migraciones
// pendientes corren dentro de UNA sola `session.transaction(...)`. Postgres no deja USAR un valor
// de enum en la misma transacción que lo agrega (55P04 unsafe use of new value). Por eso ningún
// DDL de ese lote (CHECK, DEFAULT, índice parcial…) puede nombrar 'pendiente': solo 0006 lo agrega
// y las reglas se expresan sin el literal. Estos tests lo comprueban con el SQL real.

const OLD = [
  '0000_init',
  '0001_receipt_series',
  '0002_ventas_integrity',
  '0003_names_key_columns',
  '0004_names_backfill',
  '0005_names_unique',
]
const NEW = '0006_sale_pending_status'

const statements = (tag: string) =>
  readFileSync(`./drizzle/${tag}.sql`, 'utf8')
    .split('--> statement-breakpoint')
    .filter((s) => s.trim())

async function legacyDb() {
  const client = new PGlite()
  for (const tag of OLD) for (const stmt of statements(tag)) await client.exec(stmt)
  await client.exec(`
    insert into organization (id, name, slug, created_at) values ('o', 'O', 'o', now());
    insert into "user" (id, name, email) values ('u', 'U', 'u@test.pe');
  `)
  return client
}

const insertSale = (c: PGlite, status: string, n: number) =>
  c.query(
    `insert into sale (organization_id, series, number, cashier_id, payment_method,
       subtotal_cents, igv_cents, total_cents, status)
     values ('o', 'B001', $1, 'u', 'efectivo', 85, 15, 100, $2)`,
    [n, status],
  )

describe('migración sale_pending_status', { timeout: 60_000 }, () => {
  it('la migración no nombra el literal en ningún DDL fuera del ADD VALUE', () => {
    const rest = statements(NEW).filter((s) => !/ADD VALUE/i.test(s))
    expect(rest.join('\n')).not.toMatch(/pendiente/)
    expect(statements(NEW).filter((s) => /ADD VALUE 'pendiente'/.test(s))).toHaveLength(1)
  })

  it('una BD con 0000-0005 + datos aplica 0006 en UNA transacción y luego acepta "pendiente"', async () => {
    const c = await legacyDb()
    await insertSale(c, 'completada', 1)

    await c.exec('begin')
    for (const stmt of statements(NEW)) await c.exec(stmt)
    await c.exec('commit')

    await insertSale(c, 'pendiente', 2)
    const { rows } = await c.query<{ status: string; approved_at: string | null }>(
      'select status, approved_at from sale order by number',
    )
    expect(rows.map((r) => r.status)).toEqual(['completada', 'pendiente'])
    expect(rows.every((r) => r.approved_at === null)).toBe(true)
    // organization_settings existe con el valor por defecto
    await c.exec(`insert into organization_settings (organization_id) values ('o')`)
    const s = await c.query<{ require_sale_approval: boolean }>(
      'select require_sale_approval from organization_settings',
    )
    expect(s.rows[0].require_sale_approval).toBe(false)
  })

  it('el gotcha es real: usar el valor en la misma transacción que lo agrega falla', async () => {
    const c = await legacyDb()
    await c.exec('begin')
    for (const stmt of statements(NEW)) await c.exec(stmt)
    await expect(insertSale(c, 'pendiente', 1)).rejects.toThrow(/unsafe use of new value|55P04/i)
    await c.exec('rollback')
  })

  it('migrate() de drizzle (todo en una transacción) desde cero deja el esquema usable', async () => {
    const db = drizzle(new PGlite(), { schema, casing: 'snake_case' })
    await migrate(db, { migrationsFolder: './drizzle' })
    const now = new Date()
    await db.insert(schema.organization).values({ id: 'o', name: 'O', slug: 'o', createdAt: now })
    await db.insert(schema.user).values({ id: 'u', name: 'U', email: 'u@test.pe' })
    await db.insert(schema.sale).values({
      organizationId: 'o',
      series: 'B001',
      number: 1,
      cashierId: 'u',
      paymentMethod: 'efectivo',
      subtotalCents: 85,
      igvCents: 15,
      totalCents: 100,
      status: 'pendiente',
    })
  })

  it('la aprobación es todo o nada: approved_at sin approved_by_id se rechaza', async () => {
    const c = await legacyDb()
    await c.exec('begin')
    for (const stmt of statements(NEW)) await c.exec(stmt)
    await c.exec('commit')
    await insertSale(c, 'completada', 1)
    await expect(c.exec('update sale set approved_at = now()')).rejects.toThrow(
      /sale_approval_consistent/,
    )
    await c.exec(`update sale set approved_at = now(), approved_by_id = 'u'`)
  })
})
