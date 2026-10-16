// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import { type CustomerInput, customerInputSchema } from '@/lib/customer-input'
import { searchActiveCustomers } from '@/lib/customers'
import { PAGE_SIZE } from '../lib/filters'
import {
  createCustomer,
  DuplicateDocumentError,
  exportRows,
  getCustomer,
  listCustomerSales,
  listCustomers,
  setCustomerActive,
  updateCustomer,
  type Viewer,
} from './customers'

// Migraciones reales sobre Postgres en memoria (PGlite), igual que el resto de pruebas de datos.
const db = drizzle(new PGlite(), { schema, casing: 'snake_case' })

const ORG_A = 'org-a'
const ORG_B = 'org-b'
const ROOT = 'user-root'
const ANA = 'user-ana'
const LUIS = 'user-luis'

const admin: Viewer = { userId: ROOT, role: 'admin' }
const ana: Viewer = { userId: ANA, role: 'cajero' }

/** Pasa por el mismo esquema Zod que las acciones: lo que se guarda está normalizado. */
function input(over: Record<string, string> = {}): CustomerInput {
  return customerInputSchema.parse({ name: 'Juan Pérez', ...over })
}

let seq = 0
async function insertSale(over: Partial<typeof schema.sale.$inferInsert> & { customerId: string }) {
  await db.insert(schema.sale).values({
    organizationId: ORG_A,
    series: 'B001',
    number: ++seq,
    cashierId: ANA,
    paymentMethod: 'efectivo',
    subtotalCents: 508,
    igvCents: 92,
    totalCents: 600,
    status: 'completada',
    // Con cliente, la venta guarda el snapshot de nombre (CHECK sale_customer_snapshot)
    customerName: 'Cliente de prueba',
    ...over,
  })
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
  const now = new Date()
  await db.insert(schema.organization).values([
    { id: ORG_A, name: 'Bodega A', slug: 'a', createdAt: now },
    { id: ORG_B, name: 'Bodega B', slug: 'b', createdAt: now },
  ])
  await db.insert(schema.user).values([
    { id: ROOT, name: 'Admin', email: 'root@test.pe' },
    { id: ANA, name: 'Ana Rojas', email: 'ana@test.pe' },
    { id: LUIS, name: 'Luis Soto', email: 'luis@test.pe' },
  ])
})

describe('createCustomer', () => {
  it('guarda el nombre normalizado, name_key y el documento normalizado', async () => {
    const created = await createCustomer(db, {
      orgId: ORG_A,
      input: input({
        name: '  María   Núñez ',
        documentType: 'dni',
        documentNumber: '4567 8901',
        phone: '999 888 777',
        email: 'MARIA@Correo.pe',
        address: 'Av. Lima 123',
      }),
    })
    expect(created).toMatchObject({
      name: 'María Núñez',
      documentType: 'dni',
      documentNumber: '45678901',
      phone: '999 888 777',
    })
    const [row] = await db.select().from(schema.customer).where(eq(schema.customer.id, created.id))
    expect(row).toMatchObject({
      nameKey: 'maria nuñez',
      email: 'maria@correo.pe',
      address: 'Av. Lima 123',
      active: true,
      organizationId: ORG_A,
    })
  })

  it('el documento es opcional: solo nombre', async () => {
    const c = await createCustomer(db, { orgId: ORG_A, input: input({ name: 'Doña Rosa' }) })
    expect(c).toMatchObject({ documentType: null, documentNumber: null, phone: null })
  })

  it('dos clientes pueden llamarse igual', async () => {
    await createCustomer(db, { orgId: ORG_A, input: input({ name: 'Pedro Gómez' }) })
    await expect(
      createCustomer(db, { orgId: ORG_A, input: input({ name: 'pedro gomez' }) }),
    ).resolves.toBeDefined()
  })

  it('un documento repetido en la bodega lanza DuplicateDocumentError con mensaje', async () => {
    const doc = { documentType: 'ruc', documentNumber: '20100047218' }
    await createCustomer(db, { orgId: ORG_A, input: input({ name: 'Distribuidora', ...doc }) })
    const err = await createCustomer(db, {
      orgId: ORG_A,
      input: input({ name: 'Otra', documentType: 'ruc', documentNumber: '20100047-218' }),
    }).catch((e) => e)
    expect(err).toBeInstanceOf(DuplicateDocumentError)
    expect(err.message).toBe('Ya existe un cliente con ese documento')
    // Otra bodega sí puede tener el mismo documento
    await expect(
      createCustomer(db, { orgId: ORG_B, input: input({ name: 'Distribuidora', ...doc }) }),
    ).resolves.toBeDefined()
  })
})

describe('clientes inactivos: acceso por rol', () => {
  it('el cajero no ve ni edita un cliente inactivo (ni por UUID); el admin sí', async () => {
    const c = await createCustomer(db, { orgId: ORG_A, input: input({ name: 'Baja Secreta' }) })
    await setCustomerActive(db, { orgId: ORG_A, id: c.id, active: false })

    expect(await getCustomer(db, { orgId: ORG_A, viewer: ana, id: c.id })).toBeNull()
    expect(await getCustomer(db, { orgId: ORG_A, viewer: admin, id: c.id })).toMatchObject({
      active: false,
    })
    expect(
      await updateCustomer(db, {
        orgId: ORG_A,
        role: 'cajero',
        id: c.id,
        input: input({ name: 'Editado por cajero' }),
      }),
    ).toBe(false)
    expect(
      await updateCustomer(db, {
        orgId: ORG_A,
        role: 'admin',
        id: c.id,
        input: input({ name: 'Baja Editada' }),
      }),
    ).toBe(true)
    // Un rol desconocido se trata como cajero
    expect(
      await getCustomer(db, { orgId: ORG_A, viewer: { userId: ROOT, role: 'otro' }, id: c.id }),
    ).toBeNull()
  })

  it('el cajero no obtiene inactivos en la lista aunque pida includeInactive', async () => {
    const c = await createCustomer(db, { orgId: ORG_A, input: input({ name: 'Zz Lista Baja' }) })
    await setCustomerActive(db, { orgId: ORG_A, id: c.id, active: false })
    const q = { orgId: ORG_A, query: 'zz lista baja', includeInactive: true }
    expect((await listCustomers(db, { ...q, viewer: ana })).rows).toEqual([])
    expect((await listCustomers(db, { ...q, viewer: admin })).rows).toHaveLength(1)
  })

  it('las filas de la lista no llevan correo, dirección ni fecha de alta', async () => {
    await createCustomer(db, {
      orgId: ORG_A,
      input: input({ name: 'Zz Privado', email: 'p@x.pe', address: 'Calle 1' }),
    })
    const { rows } = await listCustomers(db, { orgId: ORG_A, viewer: admin, query: 'zz privado' })
    expect(Object.keys(rows[0]).sort()).toEqual(
      [
        'active',
        'documentNumber',
        'documentType',
        'id',
        'lastPurchaseAt',
        'name',
        'phone',
        'purchaseCount',
        'totalSpentCents',
      ].sort(),
    )
  })
})

describe('esquema de entrada', () => {
  it('rechaza caracteres de control y de formato en nombre, dirección, teléfono y correo', () => {
    const ok = (o: Record<string, string>) => customerInputSchema.safeParse({ name: 'Ana', ...o })
    for (const bad of ['\u202E', '\u200B', '\u0000', '\n', '\t', '\u2066']) {
      expect(ok({ name: `Ana${bad}Rojas` }).success, JSON.stringify(bad)).toBe(false)
      expect(ok({ address: `Calle${bad}1` }).success, JSON.stringify(bad)).toBe(false)
      expect(ok({ phone: `999${bad}888777` }).success, JSON.stringify(bad)).toBe(false)
      expect(ok({ email: `a${bad}@b.pe` }).success, JSON.stringify(bad)).toBe(false)
    }
    expect(ok({ name: 'Ana Núñez', address: 'Av. Perú 123, Lima' }).success).toBe(true)
  })

  it('rechaza documento inválido, número sin tipo y tipo sin número', () => {
    const bad = (o: Record<string, string>) =>
      customerInputSchema.safeParse({ name: 'Ana', ...o }).success
    expect(bad({ documentType: 'dni', documentNumber: '1234' })).toBe(false)
    expect(bad({ documentType: 'ruc', documentNumber: '20100047219' })).toBe(false)
    expect(bad({ documentNumber: '12345678' })).toBe(false)
    expect(bad({ documentType: 'dni' })).toBe(false)
    expect(bad({ documentType: 'dni', documentNumber: '12345678' })).toBe(true)
    expect(bad({ documentType: '', documentNumber: '' })).toBe(true)
  })

  it('rechaza nombre corto, correo y teléfono inválidos', () => {
    const bad = (o: Record<string, string>) => customerInputSchema.safeParse(o).success
    expect(bad({ name: 'A' })).toBe(false)
    expect(bad({ name: 'Ana', email: 'no-es-correo' })).toBe(false)
    expect(bad({ name: 'Ana', phone: 'abc' })).toBe(false)
    expect(bad({ name: 'Ana', phone: '+51 999 888 777', email: 'a@b.pe' })).toBe(true)
  })

  it('los errores apuntan al campo correcto', () => {
    const r = customerInputSchema.safeParse({
      name: 'Ana',
      documentType: 'dni',
      documentNumber: '12',
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].path).toEqual(['documentNumber'])
      expect(r.error.issues[0].message).toMatch(/8 dígitos/)
    }
  })
})

describe('listCustomers: búsqueda y filtros', () => {
  const ORG = 'org-search'
  beforeAll(async () => {
    await db
      .insert(schema.organization)
      .values({ id: ORG, name: 'Bodega S', slug: 's', createdAt: new Date() })
    for (const i of [
      { name: 'José Álvarez', documentType: 'dni', documentNumber: '70112233' },
      { name: 'Jose Ñañez', documentType: 'dni', documentNumber: '70999999' },
      { name: 'Comercial Sol SAC', documentType: 'ruc', documentNumber: '20100047218' },
      { name: 'Carlos Inactivo', documentType: 'dni', documentNumber: '10101010' },
    ]) {
      await createCustomer(db, { orgId: ORG, input: input(i) })
    }
    const [inactive] = await db
      .select()
      .from(schema.customer)
      .where(eq(schema.customer.documentNumber, '10101010'))
    await setCustomerActive(db, { orgId: ORG, id: inactive.id, active: false })
  })

  const names = async (opts: Partial<Parameters<typeof listCustomers>[1]> = {}) =>
    (await listCustomers(db, { orgId: ORG, viewer: admin, ...opts })).rows.map((r) => r.name)

  it('lista por nombre y oculta los inactivos por defecto', async () => {
    expect(await names()).toEqual(['Comercial Sol SAC', 'José Álvarez', 'Jose Ñañez'])
  })

  it('"Mostrar inactivos" los incluye', async () => {
    expect(await names({ includeInactive: true })).toContain('Carlos Inactivo')
  })

  it('busca sin distinguir mayúsculas ni tildes', async () => {
    expect(await names({ query: 'jose' })).toEqual(['José Álvarez', 'Jose Ñañez'])
    expect(await names({ query: 'JOSÉ ALVAREZ' })).toEqual(['José Álvarez'])
    expect(await names({ query: 'sol' })).toEqual(['Comercial Sol SAC'])
  })

  it('la ñ sigue siendo otra letra', async () => {
    expect(await names({ query: 'nanez' })).toEqual([])
    expect(await names({ query: 'ñañez' })).toEqual(['Jose Ñañez'])
  })

  it('busca por documento exacto o por prefijo (con espacios y guiones)', async () => {
    expect(await names({ query: '70112233' })).toEqual(['José Álvarez'])
    expect(await names({ query: '701' })).toEqual(['José Álvarez'])
    expect(await names({ query: '7011-2233' })).toEqual(['José Álvarez'])
    expect(await names({ query: '20100047218' })).toEqual(['Comercial Sol SAC'])
    expect(await names({ query: '70' })).toEqual(['José Álvarez', 'Jose Ñañez'])
  })

  it('los comodines de LIKE se buscan literalmente', async () => {
    expect(await names({ query: '%' })).toEqual([])
    expect(await names({ query: '_' })).toEqual([])
  })

  it('no mezcla bodegas', async () => {
    expect(await names({ query: 'Comercial' })).toHaveLength(1)
    const other = await listCustomers(db, { orgId: ORG_B, viewer: admin, query: 'Comercial' })
    expect(other.rows).toEqual([])
  })

  it('pagina de 50 en 50 con hasNext', async () => {
    const org = 'org-pages'
    await db
      .insert(schema.organization)
      .values({ id: org, name: 'Bodega P', slug: 'p', createdAt: new Date() })
    await db.insert(schema.customer).values(
      Array.from({ length: PAGE_SIZE + 1 }, (_, i) => ({
        organizationId: org,
        name: `Cliente ${String(i).padStart(3, '0')}`,
        nameKey: `cliente ${String(i).padStart(3, '0')}`,
      })),
    )
    const first = await listCustomers(db, { orgId: org, viewer: admin })
    expect(first.rows).toHaveLength(PAGE_SIZE)
    expect(first.hasNext).toBe(true)
    const second = await listCustomers(db, { orgId: org, viewer: admin, page: 2 })
    expect(second.rows).toHaveLength(1)
    expect(second.hasNext).toBe(false)
    expect(second.rows[0].name).toBe(`Cliente ${String(PAGE_SIZE).padStart(3, '0')}`)
    // Página inválida = página 1
    expect((await listCustomers(db, { orgId: org, viewer: admin, page: -3 })).page).toBe(1)
  })
})

describe('compras del cliente', () => {
  let customerId: string
  beforeAll(async () => {
    customerId = (
      await createCustomer(db, {
        orgId: ORG_A,
        input: input({
          name: 'Cliente con compras',
          documentType: 'dni',
          documentNumber: '33333333',
        }),
      })
    ).id
    // Ana cobró dos completadas (600 + 600), una anulada y una pendiente; Luis cobró una (600)
    await insertSale({ customerId, createdAt: new Date('2026-10-01T15:00:00Z') })
    await insertSale({ customerId, createdAt: new Date('2026-10-10T15:00:00Z') })
    await insertSale({
      customerId,
      status: 'anulada',
      voidedAt: new Date(),
      voidedById: ROOT,
      createdAt: new Date('2026-10-12T15:00:00Z'),
    })
    await insertSale({
      customerId,
      status: 'pendiente',
      createdAt: new Date('2026-10-13T15:00:00Z'),
    })
    await insertSale({ customerId, cashierId: LUIS, createdAt: new Date('2026-10-14T15:00:00Z') })
  })

  it('el admin ve compras, total y última compra de ventas COMPLETADAS de todos', async () => {
    const c = await getCustomer(db, { orgId: ORG_A, viewer: admin, id: customerId })
    expect(c).toMatchObject({ purchaseCount: 3, totalSpentCents: 1800 })
    expect(c?.lastPurchaseAt).toBe('2026-10-14T15:00:00.000Z')
  })

  it('el cajero solo cuenta lo que cobró él', async () => {
    const c = await getCustomer(db, { orgId: ORG_A, viewer: ana, id: customerId })
    expect(c).toMatchObject({ purchaseCount: 2, totalSpentCents: 1200 })
    expect(c?.lastPurchaseAt).toBe('2026-10-10T15:00:00.000Z')
  })

  it('un rol desconocido se trata como cajero', async () => {
    const c = await getCustomer(db, {
      orgId: ORG_A,
      viewer: { userId: LUIS, role: 'otro' },
      id: customerId,
    })
    expect(c).toMatchObject({ purchaseCount: 1, totalSpentCents: 600 })
  })

  it('un cliente sin compras tiene ceros y sin fecha', async () => {
    const fresh = await createCustomer(db, { orgId: ORG_A, input: input({ name: 'Nuevo' }) })
    expect(await getCustomer(db, { orgId: ORG_A, viewer: admin, id: fresh.id })).toMatchObject({
      purchaseCount: 0,
      totalSpentCents: 0,
      lastPurchaseAt: null,
    })
  })

  it('la lista trae las mismas estadísticas (y también acotadas para el cajero)', async () => {
    const asAdmin = await listCustomers(db, { orgId: ORG_A, viewer: admin, query: 'con compras' })
    expect(asAdmin.rows[0]).toMatchObject({ purchaseCount: 3, totalSpentCents: 1800 })
    const asAna = await listCustomers(db, { orgId: ORG_A, viewer: ana, query: 'con compras' })
    expect(asAna.rows[0]).toMatchObject({ purchaseCount: 2, totalSpentCents: 1200 })
  })

  it('historial: todos los estados para el admin, más reciente primero', async () => {
    const h = await listCustomerSales(db, { orgId: ORG_A, viewer: admin, customerId })
    expect(h.rows.map((r) => r.status)).toEqual([
      'completada',
      'pendiente',
      'anulada',
      'completada',
      'completada',
    ])
    expect(h.rows[0].cashierName).toBe('Luis Soto')
    expect(h.hasNext).toBe(false)
  })

  it('historial: el cajero solo ve las ventas que cobró', async () => {
    const h = await listCustomerSales(db, { orgId: ORG_A, viewer: ana, customerId })
    expect(h.rows).toHaveLength(4)
    expect(h.rows.every((r) => r.cashierName === 'Ana Rojas')).toBe(true)
  })

  it('historial: de otra bodega no devuelve nada', async () => {
    const h = await listCustomerSales(db, { orgId: ORG_B, viewer: admin, customerId })
    expect(h.rows).toEqual([])
  })

  it('getCustomer de otra bodega es null', async () => {
    expect(await getCustomer(db, { orgId: ORG_B, viewer: admin, id: customerId })).toBeNull()
  })
})

describe('updateCustomer / setCustomerActive', () => {
  it('edita y recalcula name_key; no toca clientes de otra bodega', async () => {
    const c = await createCustomer(db, { orgId: ORG_A, input: input({ name: 'Antes Nombre' }) })
    expect(
      await updateCustomer(db, {
        orgId: ORG_B,
        role: 'admin',
        id: c.id,
        input: input({ name: 'Hackeado' }),
      }),
    ).toBe(false)
    expect(
      await updateCustomer(db, {
        orgId: ORG_A,
        role: 'admin',
        id: c.id,
        input: input({ name: 'Después Ñoño', email: 'x@y.pe', address: 'Jr. Uno' }),
      }),
    ).toBe(true)
    const [row] = await db.select().from(schema.customer).where(eq(schema.customer.id, c.id))
    expect(row).toMatchObject({
      name: 'Después Ñoño',
      nameKey: 'despues ñoño',
      email: 'x@y.pe',
      address: 'Jr. Uno',
    })
  })

  it('editar a un documento ya usado lanza DuplicateDocumentError', async () => {
    const a = await createCustomer(db, {
      orgId: ORG_A,
      input: input({ name: 'Doc A', documentType: 'dni', documentNumber: '55555555' }),
    })
    const b = await createCustomer(db, { orgId: ORG_A, input: input({ name: 'Doc B' }) })
    await expect(
      updateCustomer(db, {
        orgId: ORG_A,
        role: 'admin',
        id: b.id,
        input: input({ name: 'Doc B', documentType: 'dni', documentNumber: '55555555' }),
      }),
    ).rejects.toBeInstanceOf(DuplicateDocumentError)
    // Guardar al mismo cliente con su propio documento no es un duplicado
    await expect(
      updateCustomer(db, {
        orgId: ORG_A,
        role: 'admin',
        id: a.id,
        input: input({ name: 'Doc A2', documentType: 'dni', documentNumber: '55555555' }),
      }),
    ).resolves.toBe(true)
  })

  it('desactivar oculta de la caja y de la lista; reactivar lo devuelve; otra bodega no puede', async () => {
    const c = await createCustomer(db, { orgId: ORG_A, input: input({ name: 'Zeta Toggle' }) })
    const findInCaja = async () =>
      (await searchActiveCustomers(db, { orgId: ORG_A, query: 'zeta toggle' })).length

    expect(await findInCaja()).toBe(1)
    expect(await setCustomerActive(db, { orgId: ORG_B, id: c.id, active: false })).toBe(false)
    expect(await findInCaja()).toBe(1)

    expect(await setCustomerActive(db, { orgId: ORG_A, id: c.id, active: false })).toBe(true)
    expect(await findInCaja()).toBe(0)
    const list = await listCustomers(db, { orgId: ORG_A, viewer: admin, query: 'zeta toggle' })
    expect(list.rows).toEqual([])
    // El perfil sigue accesible (las ventas lo referencian)
    expect(await getCustomer(db, { orgId: ORG_A, viewer: admin, id: c.id })).toMatchObject({
      active: false,
    })

    expect(await setCustomerActive(db, { orgId: ORG_A, id: c.id, active: true })).toBe(true)
    expect(await findInCaja()).toBe(1)
  })
})

describe('searchActiveCustomers (selector de la caja)', () => {
  it('limita el número de resultados y solo busca en la bodega', async () => {
    const org = 'org-picker'
    await db
      .insert(schema.organization)
      .values({ id: org, name: 'Bodega Pick', slug: 'pick', createdAt: new Date() })
    await db.insert(schema.customer).values(
      Array.from({ length: 12 }, (_, i) => ({
        organizationId: org,
        name: `Pick ${String(i).padStart(2, '0')}`,
        nameKey: `pick ${String(i).padStart(2, '0')}`,
      })),
    )
    expect(await searchActiveCustomers(db, { orgId: org, query: '' })).toHaveLength(8)
    expect(await searchActiveCustomers(db, { orgId: org, query: 'pick', limit: 3 })).toHaveLength(3)
    expect(await searchActiveCustomers(db, { orgId: ORG_B, query: 'pick' })).toEqual([])
  })
})

describe('exportRows', () => {
  it('incluye inactivos si se pide, con compras completadas', async () => {
    const org = 'org-export'
    await db
      .insert(schema.organization)
      .values({ id: org, name: 'Bodega X', slug: 'x', createdAt: new Date() })
    const active = await createCustomer(db, { orgId: org, input: input({ name: 'Activo Uno' }) })
    const inactive = await createCustomer(db, { orgId: org, input: input({ name: 'Baja Dos' }) })
    await setCustomerActive(db, { orgId: org, id: inactive.id, active: false })
    await insertSale({ organizationId: org, customerId: active.id })

    const onlyActive = await exportRows(db, { orgId: org, viewer: admin })
    expect(onlyActive.rows.map((r) => r.name)).toEqual(['Activo Uno'])
    expect(onlyActive.rows[0]).toMatchObject({
      purchaseCount: 1,
      totalSpentCents: 600,
      active: true,
    })
    expect(onlyActive.truncated).toBe(false)

    const all = await exportRows(db, { orgId: org, viewer: admin, includeInactive: true })
    expect(all.rows.map((r) => r.name)).toEqual(['Activo Uno', 'Baja Dos'])
    expect(all.rows[1]).toMatchObject({ active: false, purchaseCount: 0, lastPurchaseAt: null })
    // La fila exportada no filtra identificadores internos
    expect(all.rows[0]).not.toHaveProperty('id')
    expect(all.rows[0]).not.toHaveProperty('createdAt')
  })
})
