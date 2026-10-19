// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

// Better Auth (storage: 'database') lee/escribe el modelo `rateLimit` con key, count y lastRequest
// (node_modules/better-auth/dist/api/rate-limiter/index.mjs). lastRequest guarda Date.now() en ms:
// no cabe en integer, por eso bigint.
describe('migración rate_limit', { timeout: 60_000 }, () => {
  const sql = readFileSync('./drizzle/0010_rate_limit.sql', 'utf8')

  it('crea la tabla con las columnas que usa Better Auth', async () => {
    const c = new PGlite()
    await c.exec(sql)
    const { rows } = await c.query<{ column_name: string; data_type: string; is_nullable: string }>(
      `select column_name, data_type, is_nullable from information_schema.columns
       where table_name = 'rate_limit' order by column_name`,
    )
    expect(rows).toEqual([
      { column_name: 'count', data_type: 'integer', is_nullable: 'NO' },
      { column_name: 'id', data_type: 'text', is_nullable: 'NO' },
      { column_name: 'key', data_type: 'text', is_nullable: 'NO' },
      { column_name: 'last_request', data_type: 'bigint', is_nullable: 'NO' },
    ])
  })

  it('key es única y last_request admite epoch en milisegundos', async () => {
    const c = new PGlite()
    await c.exec(sql)
    await c.query(
      `insert into rate_limit (id, key, count, last_request) values ('1','1.2.3.4|/sign-in/email',1,$1)`,
      [Date.now()],
    )
    await expect(
      c.query(
        `insert into rate_limit (id, key, count, last_request) values ('2','1.2.3.4|/sign-in/email',1,$1)`,
        [Date.now()],
      ),
    ).rejects.toThrow()
  })
})
