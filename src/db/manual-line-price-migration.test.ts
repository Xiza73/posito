// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'

// 0015 agrega organization_settings.allow_manual_price NOT NULL sobre filas existentes y amplía los
// CHECK de sale_item ('manual'). Aquí se aplica el SQL real sobre una BD con ventas ya hechas
// (normal y mayor) y ajustes ya guardados.

const statements = (file: string) =>
  readFileSync(`./drizzle/${file}`, 'utf8')
    .split('--> statement-breakpoint')
    .filter((s) => s.trim())

const files = readdirSync('./drizzle')
  .filter((f) => f.endsWith('.sql'))
  .sort()
const NEW = '0015_manual_line_price.sql'

const SALE = '22222222-2222-4222-8222-222222222222'
const PRODUCT = '11111111-1111-4111-8111-111111111111'

async function legacyDb() {
  const c = new PGlite()
  for (const f of files.filter((f) => f < NEW)) for (const s of statements(f)) await c.exec(s)
  await c.exec(`
    insert into organization (id, name, slug, created_at) values ('o', 'O', 'o', now());
    insert into organization_settings (organization_id, require_sale_approval) values ('o', true);
    insert into "user" (id, name, email) values ('u', 'U', 'u@test.pe');
    insert into product (id, organization_id, name, name_key, price_cents)
      values ('${PRODUCT}', 'o', 'Inca Kola', 'inca kola', 300);
    insert into sale (id, organization_id, series, number, cashier_id, payment_method,
        subtotal_cents, igv_cents, total_cents)
      values ('${SALE}', 'o', 'B001', 1, 'u', 'efectivo', 1017, 183, 1200);
    insert into sale_item (sale_id, product_id, product_name, unit_price_cents,
        list_unit_price_cents, price_source, quantity, line_total_cents)
      values ('${SALE}', '${PRODUCT}', 'Inca Kola', 300, 300, 'normal', 2, 600),
             ('${SALE}', '${PRODUCT}', 'Inca Kola', 250, 300, 'mayor', 6, 1500);
  `)
  return c
}

describe('migración manual_line_price', { timeout: 60_000 }, () => {
  it('no usa enums nuevos (price_source es text + CHECK)', () => {
    expect(files).toContain(NEW)
    expect(statements(NEW).join('\n')).not.toMatch(/ADD VALUE|CREATE TYPE/i)
  })

  it('con datos existentes: las ventas viejas siguen intactas y los ajustes conservan sus valores', async () => {
    const c = await legacyDb()
    for (const s of statements(NEW)) await c.exec(s)
    const { rows: items } = await c.query<{ price_source: string; line_total_cents: number }>(
      'select price_source, line_total_cents from sale_item order by line_total_cents',
    )
    expect(items).toEqual([
      { price_source: 'normal', line_total_cents: 600 },
      { price_source: 'mayor', line_total_cents: 1500 },
    ])
    const { rows: settings } = await c.query<{
      require_sale_approval: boolean
      allow_manual_price: boolean
    }>('select require_sale_approval, allow_manual_price from organization_settings')
    expect(settings).toEqual([{ require_sale_approval: true, allow_manual_price: false }])
  })

  it('los CHECK nuevos aceptan manual y siguen exigiendo unitario × cantidad en las demás', async () => {
    const c = await legacyDb()
    for (const s of statements(NEW)) await c.exec(s)
    const ins = (unit: number, source: string, qty: number, total: number) =>
      c.query(
        `insert into sale_item (sale_id, product_id, product_name, unit_price_cents,
           list_unit_price_cents, price_source, quantity, line_total_cents)
         values ('${SALE}', '${PRODUCT}', 'X', $1, 300, $2, $3, $4)`,
        [unit, source, qty, total],
      )
    await expect(ins(333, 'manual', 3, 1000)).resolves.toBeDefined()
    await expect(ins(0, 'manual', 3, 0)).rejects.toThrow() // manual >= 1 céntimo
    await expect(ins(333, 'normal', 3, 1000)).rejects.toThrow() // normal: unit × qty (y unit = lista)
    await expect(ins(250, 'mayor', 3, 751)).rejects.toThrow() // mayor: unit × qty
    await expect(ins(250, 'mayor', 3, 750)).resolves.toBeDefined()
    await expect(ins(250, 'otro', 3, 750)).rejects.toThrow()
  })
})
