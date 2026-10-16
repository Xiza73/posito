// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'
import { nameKey } from '@/lib/name-key'

// Ejecuta el SQL REAL de las migraciones 0000-0006 y, con clientes "legados" ya cargados, la 0007
// (clientes) como lo hace drizzle: todo el archivo dentro de UNA transacción.

const BEFORE = [
  '0000_init',
  '0001_receipt_series',
  '0002_ventas_integrity',
  '0003_names_key_columns',
  '0004_names_backfill',
  '0005_names_unique',
  '0006_sale_pending_status',
]
const CLIENTES = '0007_clientes'

const statements = (tag: string) =>
  readFileSync(`./drizzle/${tag}.sql`, 'utf8')
    .split('--> statement-breakpoint')
    .filter((s) => s.trim())

async function legacyDb() {
  const client = new PGlite()
  for (const tag of BEFORE) for (const stmt of statements(tag)) await client.exec(stmt)
  for (const org of ['a', 'b']) {
    await client.query(
      'insert into organization (id, name, slug, created_at) values ($1, $1, $1, now())',
      [org],
    )
  }
  return client
}

const migrate = (client: PGlite) =>
  client.transaction(async (tx) => {
    for (const stmt of statements(CLIENTES)) await tx.exec(stmt)
  })

const addLegacy = (
  c: PGlite,
  org: string,
  name: string,
  type: string | null = null,
  number: string | null = null,
) =>
  c.query(
    'insert into customer (organization_id, name, document_type, document_number) values ($1, $2, $3, $4)',
    [org, name, type, number],
  )

type Row = {
  name: string
  name_key: string
  active: boolean
  document_type: string | null
  document_number: string | null
}
const rowsOf = async (c: PGlite, org: string) =>
  (
    await c.query<Row>(
      'select name, name_key, active, document_type, document_number from customer where organization_id = $1 order by name',
      [org],
    )
  ).rows

describe('migración clientes (0007)', { timeout: 60_000 }, () => {
  it('rellena name_key igual que nameKey() en JS, sin deduplicar ni perder filas', async () => {
    const client = await legacyDb()
    const samples = [
      'Juan Pérez',
      'JUAN PEREZ',
      '  María   Núñez  ',
      'Ñandú',
      'pingüino',
      'Tía Ñoña',
      'Distribuidora ÁÉÍÓÚ SAC',
    ]
    for (const name of samples) await addLegacy(client, 'a', name)
    await addLegacy(client, 'b', 'Juan Pérez')

    await migrate(client)

    const rows = await rowsOf(client, 'a')
    expect(rows).toHaveLength(samples.length) // los dos "Juan Pérez" siguen existiendo
    for (const r of rows) expect(r.name_key, r.name).toBe(nameKey(r.name))
    expect(rows.filter((r) => r.name_key === 'juan perez')).toHaveLength(2)
    expect(await rowsOf(client, 'b')).toHaveLength(1)
    // Los clientes existentes quedan activos
    expect(rows.every((r) => r.active)).toBe(true)
  })

  it('name_key queda NOT NULL y el esquema nuevo expone email, dirección y activo', async () => {
    const client = await legacyDb()
    await migrate(client)
    await expect(
      client.query("insert into customer (organization_id, name) values ('a', 'Sin clave')"),
    ).rejects.toThrow()
    await client.query(
      "insert into customer (organization_id, name, name_key, email, address) values ('a', 'Ana', 'ana', 'ana@correo.pe', 'Av. Lima 1')",
    )
    const [r] = (
      await client.query<{ active: boolean; email: string; address: string }>(
        "select active, email, address from customer where name_key = 'ana'",
      )
    ).rows
    expect(r).toEqual({ active: true, email: 'ana@correo.pe', address: 'Av. Lima 1' })
  })

  it('repara pares tipo/número a medias de filas legadas', async () => {
    const client = await legacyDb()
    await addLegacy(client, 'a', 'Con DNI sin tipo', null, '12345678')
    await addLegacy(client, 'a', 'Con RUC sin tipo', null, '20100047218')
    await addLegacy(client, 'a', 'Con otro sin tipo', null, 'AB1234567')
    await addLegacy(client, 'a', 'Tipo sin número', 'dni', null)
    await addLegacy(client, 'a', 'Completo', 'ruc', '20512345678')
    await addLegacy(client, 'a', 'Sin documento')

    await migrate(client)

    const by = Object.fromEntries((await rowsOf(client, 'a')).map((r) => [r.name, r]))
    expect(by['Con DNI sin tipo']).toMatchObject({
      document_type: 'dni',
      document_number: '12345678',
    })
    expect(by['Con RUC sin tipo']).toMatchObject({
      document_type: 'ruc',
      document_number: '20100047218',
    })
    expect(by['Con otro sin tipo']).toMatchObject({ document_type: 'ce' })
    expect(by['Tipo sin número']).toMatchObject({ document_type: null, document_number: null })
    expect(by.Completo).toMatchObject({ document_type: 'ruc', document_number: '20512345678' })
    expect(by['Sin documento']).toMatchObject({ document_type: null, document_number: null })
  })

  it('el CHECK exige tipo y número juntos (o ninguno)', async () => {
    const client = await legacyDb()
    await migrate(client)
    const insert = (type: string | null, number: string | null) =>
      client.query(
        'insert into customer (organization_id, name, name_key, document_type, document_number) values ($1, $2, $2, $3, $4)',
        ['a', crypto.randomUUID(), type, number],
      )
    await expect(insert('dni', null)).rejects.toMatchObject({
      constraint: 'customer_document_pair',
    })
    await expect(insert(null, '12345678')).rejects.toMatchObject({
      constraint: 'customer_document_pair',
    })
    await expect(insert('dni', '12345678')).resolves.toBeDefined()
    await expect(insert(null, null)).resolves.toBeDefined()
  })

  it('unicidad del documento por bodega + tipo + número', async () => {
    const client = await legacyDb()
    await addLegacy(client, 'a', 'Existente', 'dni', '11111111')
    await migrate(client)
    const insert = (org: string, type: string | null, number: string | null) =>
      client.query(
        'insert into customer (organization_id, name, name_key, document_type, document_number) values ($1, $2, $2, $3, $4)',
        [org, crypto.randomUUID(), type, number],
      )

    // El mismo documento en la misma bodega se rechaza (también contra una fila legada)...
    await expect(insert('a', 'dni', '11111111')).rejects.toMatchObject({
      constraint: 'customer_org_document_uq',
    })
    // ...pero otra bodega puede tenerlo
    await expect(insert('b', 'dni', '11111111')).resolves.toBeDefined()
    // Un CE de 11 dígitos no choca con un RUC igual: son documentos distintos
    await expect(insert('a', 'ruc', '20100047218')).resolves.toBeDefined()
    await expect(insert('a', 'ce', '20100047218')).resolves.toBeDefined()
    await expect(insert('a', 'ce', '20100047218')).rejects.toMatchObject({
      constraint: 'customer_org_document_uq',
    })
    // Sin documento puede haber muchos
    await expect(insert('a', null, null)).resolves.toBeDefined()
    await expect(insert('a', null, null)).resolves.toBeDefined()
  })

  it('no hay unicidad por nombre: dos clientes pueden llamarse igual', async () => {
    const client = await legacyDb()
    await migrate(client)
    const add = () =>
      client.query(
        "insert into customer (organization_id, name, name_key) values ('a', 'Juan Pérez', 'juan perez')",
      )
    await add()
    await expect(add()).resolves.toBeDefined()
  })
})
