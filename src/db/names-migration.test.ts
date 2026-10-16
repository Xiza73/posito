// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'
import { nameKey } from '@/lib/name-key'

// Ejecuta el SQL REAL de las migraciones 0000-0005 paso a paso sobre PGlite, insertando datos
// "legados" (con duplicados) entre el paso 0003 (columna nullable) y el 0004 (backfill + dedupe).

const MIGRATIONS = [
  '0000_init',
  '0001_receipt_series',
  '0002_ventas_integrity',
  '0003_names_key_columns',
  '0004_names_backfill',
  '0005_names_unique',
]

async function apply(client: PGlite, tag: string) {
  const sql = readFileSync(`./drizzle/${tag}.sql`, 'utf8')
  for (const stmt of sql.split('--> statement-breakpoint')) {
    if (stmt.trim()) await client.exec(stmt)
  }
}

async function legacyDb() {
  const client = new PGlite()
  for (const tag of MIGRATIONS.slice(0, 4)) await apply(client, tag)
  return client
}

const addOrg = (c: PGlite, id: string) =>
  c.query('insert into organization (id, name, slug, created_at) values ($1, $1, $1, now())', [id])
const addCategory = (c: PGlite, org: string, name: string, createdAt: string) =>
  c.query(
    'insert into category (id, organization_id, name, created_at) values (gen_random_uuid(), $1, $2, $3)',
    [org, name, createdAt],
  )
const addProduct = (c: PGlite, org: string, name: string, createdAt: string) =>
  c.query(
    'insert into product (organization_id, name, price_cents, created_at) values ($1, $2, 100, $3)',
    [org, name, createdAt],
  )

const namesOf = async (c: PGlite, table: 'category' | 'product', org: string) =>
  (
    await c.query<{ name: string; name_key: string }>(
      `select name, name_key from ${table} where organization_id = $1 order by created_at, id`,
      [org],
    )
  ).rows

describe('migración names_backfill', { timeout: 60_000 }, () => {
  it('el backfill en SQL produce la misma clave que nameKey() en JS', async () => {
    const samples = [
      'Hogar',
      'HOGAR',
      '  hogar  ',
      'Lácteos',
      'LÁCTEOS',
      'Lacteos',
      'Año',
      'Ano',
      'Ñandú',
      'ñandu',
      'pingüino',
      'PINGÜINO',
      'Inca  Kola 500 ml',
      'inca kola 500 ML',
      'Pan francés',
      'Café\tpasado',
      'Café con leche',
      'Panadería & más',
      'Jalapeño',
      'Atún Florida lata 170 g',
      'Pan 🥖',
      '日本茶',
      'Ça va',
      'Tía Ñoña',
      'ÀÈÌÒÙ âêîôû äëïö',
    ]
    const client = await legacyDb()
    for (const [i, name] of samples.entries()) {
      // Una bodega por muestra: así el dedupe no interviene y se compara solo la clave.
      await addOrg(client, `o${i}`)
      await addCategory(client, `o${i}`, name, '2026-01-01T00:00:00Z')
      await addProduct(client, `o${i}`, name, '2026-01-01T00:00:00Z')
    }
    await apply(client, MIGRATIONS[4])

    for (const [i, name] of samples.entries()) {
      const [cat] = await namesOf(client, 'category', `o${i}`)
      const [prod] = await namesOf(client, 'product', `o${i}`)
      expect(cat.name_key, `categoría ${JSON.stringify(name)}`).toBe(nameKey(name))
      expect(prod.name_key, `producto ${JSON.stringify(name)}`).toBe(nameKey(name))
    }
  })

  it('dedupe: conserva el más antiguo, renombra el resto con sufijo y no pierde filas', async () => {
    const client = await legacyDb()
    await addOrg(client, 'a')
    await addOrg(client, 'b')
    // Insertados en desorden: el orden de antigüedad lo da created_at, no el de inserción.
    await addCategory(client, 'a', 'hogar', '2026-03-01T00:00:00Z')
    await addCategory(client, 'a', 'Hogar', '2026-01-01T00:00:00Z')
    await addCategory(client, 'a', 'HOGAR', '2026-02-01T00:00:00Z')
    // Una fila legítima que ya ocupa el sufijo "(2)": el dedupe debe saltarlo.
    await addCategory(client, 'a', 'Hogar (2)', '2026-04-01T00:00:00Z')
    await addCategory(client, 'a', 'Lácteos', '2026-01-01T00:00:00Z')
    await addCategory(client, 'a', 'Lacteos', '2026-01-02T00:00:00Z')
    await addCategory(client, 'b', 'Hogar', '2026-01-01T00:00:00Z') // otra bodega: intacta
    await addProduct(client, 'a', 'Inca Kola 500 ml', '2026-01-01T00:00:00Z')
    await addProduct(client, 'a', 'inca  kola 500 ML', '2026-01-02T00:00:00Z')
    await addProduct(client, 'a', 'Sal', '2026-01-03T00:00:00Z')

    await apply(client, MIGRATIONS[4])

    const cats = await namesOf(client, 'category', 'a')
    expect(cats).toHaveLength(6)
    const byName = Object.fromEntries(cats.map((c) => [c.name, c.name_key]))
    expect(byName).toEqual({
      Hogar: 'hogar', // el más antiguo, intacto
      'HOGAR (3)': 'hogar (3)', // 2.º: "(2)" ya lo ocupa una fila legítima, se salta
      'Hogar (2)': 'hogar (2)', // la legítima, intacta
      'hogar (4)': 'hogar (4)', // el más reciente
      Lácteos: 'lacteos',
      'Lacteos (2)': 'lacteos (2)',
    })
    expect(await namesOf(client, 'category', 'b')).toEqual([{ name: 'Hogar', name_key: 'hogar' }])

    const prods = await namesOf(client, 'product', 'a')
    expect(prods).toEqual([
      { name: 'Inca Kola 500 ml', name_key: 'inca kola 500 ml' },
      { name: 'inca  kola 500 ML (2)', name_key: 'inca kola 500 ml (2)' },
      { name: 'Sal', name_key: 'sal' },
    ])

    // Tras el dedupe, la migración que endurece el esquema ya no puede fallar...
    await apply(client, MIGRATIONS[5])
    // ...y los índices únicos quedan activos
    await expect(addCategoryWithKey(client, 'a', 'x', 'hogar')).rejects.toMatchObject({
      constraint: 'category_org_name_uq',
    })
    await expect(
      client.query(
        "insert into product (organization_id, name, name_key, price_cents) values ('a', 'x', 'sal', 1)",
      ),
    ).rejects.toMatchObject({ constraint: 'product_org_name_key_uq' })
    await expect(
      client.query('insert into category (organization_id, name) values ($1, $2)', [
        'a',
        'sin clave',
      ]),
    ).rejects.toThrow() // name_key NOT NULL
  })
})

const addCategoryWithKey = (c: PGlite, org: string, name: string, key: string) =>
  c.query('insert into category (organization_id, name, name_key) values ($1, $2, $3)', [
    org,
    name,
    key,
  ])
