// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

// 0014 agrega sale_item.list_unit_price_cents NOT NULL sobre una tabla que YA tiene filas: la
// migración lo añade nullable, rellena con unit_price_cents y recién entonces exige NOT NULL, todo
// en la misma corrida. Aquí se aplica el SQL real sobre una BD con ventas existentes.

const statements = (file: string) =>
  readFileSync(`./drizzle/${file}`, 'utf8')
    .split('--> statement-breakpoint')
    .filter((s) => s.trim())

const files = readdirSync('./drizzle')
  .filter((f) => f.endsWith('.sql'))
  .sort()
const NEW = '0014_wholesale_tiers.sql'

async function legacyDb() {
  const c = new PGlite()
  for (const f of files.filter((f) => f < NEW)) for (const s of statements(f)) await c.exec(s)
  await c.exec(`
    insert into organization (id, name, slug, created_at) values ('o', 'O', 'o', now());
    insert into "user" (id, name, email) values ('u', 'U', 'u@test.pe');
    insert into product (id, organization_id, name, name_key, price_cents)
      values ('11111111-1111-4111-8111-111111111111', 'o', 'Inca Kola', 'inca kola', 300);
    insert into sale (id, organization_id, series, number, cashier_id, payment_method,
        subtotal_cents, igv_cents, total_cents)
      values ('22222222-2222-4222-8222-222222222222', 'o', 'B001', 1, 'u', 'efectivo', 508, 92, 600);
    insert into sale_item (sale_id, product_id, product_name, unit_price_cents, quantity, line_total_cents)
      values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
        'Inca Kola', 300, 2, 600);
  `)
  return c
}

describe('migración wholesale_tiers', { timeout: 60_000 }, () => {
  it('no usa enums nuevos', () => {
    expect(files).toContain(NEW)
    expect(statements(NEW).join('\n')).not.toMatch(/ADD VALUE|CREATE TYPE/i)
  })

  it('con ventas existentes rellena list_unit_price_cents = unit_price_cents y price_source = normal', async () => {
    const c = await legacyDb()
    for (const s of statements(NEW)) await c.exec(s)
    const { rows } = await c.query<{
      unit_price_cents: number
      list_unit_price_cents: number
      price_source: string
    }>('select unit_price_cents, list_unit_price_cents, price_source from sale_item')
    expect(rows).toEqual([
      { unit_price_cents: 300, list_unit_price_cents: 300, price_source: 'normal' },
    ])
    const { rows: col } = await c.query<{ is_nullable: string }>(
      `select is_nullable from information_schema.columns
       where table_name = 'sale_item' and column_name = 'list_unit_price_cents'`,
    )
    expect(col[0].is_nullable).toBe('NO')
  })

  it('price_source solo acepta normal o mayor y es coherente con los precios', async () => {
    const c = await legacyDb()
    for (const s of statements(NEW)) await c.exec(s)
    const ins = (unit: number, list: number, source: string) =>
      c.query(
        `insert into sale_item (sale_id, product_id, product_name, unit_price_cents,
           list_unit_price_cents, price_source, quantity, line_total_cents)
         values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
           'X', $1, $2, $3, 1, $1)`,
        [unit, list, source],
      )
    await expect(ins(250, 300, 'mayor')).resolves.toBeDefined()
    await expect(ins(300, 300, 'normal')).resolves.toBeDefined()
    await expect(ins(300, 300, 'mayor')).rejects.toThrow() // mayor debe abaratar
    await expect(ins(250, 300, 'normal')).rejects.toThrow() // normal = precio de lista
    await expect(ins(250, 300, 'manual')).rejects.toThrow() // aún no existe
  })
})
