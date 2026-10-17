// @vitest-environment node
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { beforeAll, describe, expect, it } from 'vitest'
import * as schema from '@/db/schema'
import type { PaymentMethod } from '@/lib/payment'
import type { Period } from '../lib/period'
import { type Dashboard, getDashboard, type Viewer } from './dashboard'

// Migraciones reales sobre Postgres en memoria (PGlite).
const db = drizzle(new PGlite(), { schema, casing: 'snake_case' })

const ORG_A = 'org-a'
const ANA = 'user-ana' // cajera
const LUIS = 'user-luis' // cajero
const ROOT = 'user-root' // administrador

const admin: Viewer = { userId: ROOT, role: 'admin' }
const owner: Viewer = { userId: ROOT, role: 'owner' }
const ana: Viewer = { userId: ANA, role: 'cajero' }

// Jueves 15-oct-2026, 15:00 en Lima
const NOW = new Date('2026-10-15T15:00:00-05:00')
const at = (isoLima: string) => new Date(`${isoLima}-05:00`)

let seq = 0

async function newProduct(
  over: Partial<typeof schema.product.$inferInsert> = {},
  orgId = ORG_A,
): Promise<string> {
  const [p] = await db
    .insert(schema.product)
    .values({
      organizationId: orgId,
      name: 'Inca Kola',
      nameKey: crypto.randomUUID(),
      priceCents: 300,
      stock: 10,
      ...over,
    })
    .returning({ id: schema.product.id })
  return p.id
}

type Fixture = {
  orgId?: string
  cashierId?: string
  createdAt: Date
  method?: PaymentMethod
  status?: 'completada' | 'pendiente' | 'anulada'
  /** Importe total; si hay `items` se deriva de ellos. */
  totalCents?: number
  items?: {
    productId: string
    qty: number
    unitPriceCents: number
    name: string
    /** Línea con precio editado: importe cobrado (el normal es unitPriceCents × qty). */
    manualTotalCents?: number
  }[]
}

async function insertSale(f: Fixture): Promise<string> {
  const orgId = f.orgId ?? ORG_A
  const items = f.items ?? []
  const total = items.length
    ? items.reduce((a, i) => a + (i.manualTotalCents ?? i.unitPriceCents * i.qty), 0)
    : (f.totalCents ?? 1000)
  const igv = total - Math.round(total / 1.18)
  const id = crypto.randomUUID()
  const status = f.status ?? 'completada'
  await db.insert(schema.sale).values({
    id,
    organizationId: orgId,
    series: 'B001',
    number: ++seq,
    cashierId: f.cashierId ?? ANA,
    status,
    paymentMethod: f.method ?? 'efectivo',
    subtotalCents: total - igv,
    igvCents: igv,
    totalCents: total,
    createdAt: f.createdAt,
    ...(status === 'anulada'
      ? { voidedAt: f.createdAt, voidedById: ROOT, voidReason: 'Error de cobro' }
      : {}),
  })
  if (items.length) {
    await db.insert(schema.saleItem).values(
      items.map((i) => ({
        saleId: id,
        productId: i.productId,
        productName: i.name,
        unitPriceCents:
          i.manualTotalCents === undefined
            ? i.unitPriceCents
            : Math.floor(i.manualTotalCents / i.qty),
        listUnitPriceCents: i.unitPriceCents,
        priceSource: i.manualTotalCents === undefined ? ('normal' as const) : ('manual' as const),
        quantity: i.qty,
        lineTotalCents: i.manualTotalCents ?? i.unitPriceCents * i.qty,
      })),
    )
  }
  return id
}

const dash = (
  period: Period,
  viewer: Viewer = admin,
  orgId = ORG_A,
  now = NOW,
): Promise<Dashboard> => getDashboard(db, { orgId, viewer, period, now })

beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' })
  const now = new Date()
  await db
    .insert(schema.organization)
    .values([{ id: ORG_A, name: 'Bodega A', slug: 'a', createdAt: now }])
  await db.insert(schema.user).values([
    { id: ANA, name: 'Ana Rojas', email: 'ana@test.pe' },
    { id: LUIS, name: 'Luis Paz', email: 'luis@test.pe' },
    { id: ROOT, name: 'Rosa Admin', email: 'rosa@test.pe' },
  ])
  await db.insert(schema.member).values([
    { id: 'm1', organizationId: ORG_A, userId: ANA, role: 'cajero', createdAt: now },
    { id: 'm2', organizationId: ORG_A, userId: ROOT, role: 'admin', createdAt: now },
  ])
})

// Cada describe usa una bodega/fecha propia (NOW distinto) para no mezclar ventas entre tests.
// Aquí las bodegas extra se crean al vuelo.
let orgSeq = 0
async function freshOrg(): Promise<string> {
  const id = `org-t${++orgSeq}`
  await db.insert(schema.organization).values({ id, name: id, slug: id, createdAt: new Date() })
  return id
}

describe('getDashboard: totales', () => {
  it('suma solo completadas; anuladas y pendientes no suman dinero', async () => {
    const org = await freshOrg()
    await insertSale({ orgId: org, createdAt: at('2026-10-15T09:00:00'), totalCents: 1000 })
    await insertSale({ orgId: org, createdAt: at('2026-10-15T10:00:00'), totalCents: 500 })
    await insertSale({
      orgId: org,
      createdAt: at('2026-10-15T11:00:00'),
      totalCents: 9999,
      status: 'anulada',
    })
    await insertSale({
      orgId: org,
      createdAt: at('2026-10-15T12:00:00'),
      totalCents: 7777,
      status: 'pendiente',
    })

    const d = await dash('hoy', admin, org)
    expect(d.totals).toEqual({ totalCents: 1500, count: 2, avgTicketCents: 750 })
    expect(d.voidedCount).toBe(1)
    expect(d.range).toEqual({ from: '2026-10-15', to: '2026-10-15' })
    // Los buckets tampoco cuentan dinero de anuladas/pendientes
    expect(d.buckets.items.reduce((a, b) => a + b.cents, 0)).toBe(1500)
  })

  it('sin ventas: ceros, ticket 0 y sin comparación', async () => {
    const org = await freshOrg()
    const d = await dash('hoy', admin, org)
    expect(d.totals).toEqual({ totalCents: 0, count: 0, avgTicketCents: 0 })
    expect(d.changes).toEqual({ total: null, count: null, avgTicket: null })
    expect(d.topProducts).toEqual([])
    expect(d.buckets.items).toHaveLength(24)
    expect(d.pendingCount).toBe(0)
  })

  it('redondea el ticket promedio a céntimos enteros', async () => {
    const org = await freshOrg()
    for (const c of [100, 100, 101]) {
      await insertSale({ orgId: org, createdAt: at('2026-10-15T09:00:00'), totalCents: c })
    }
    expect((await dash('hoy', admin, org)).totals.avgTicketCents).toBe(100) // 301/3 = 100.33
  })

  it('"ayer" mira el día anterior de Lima', async () => {
    const org = await freshOrg()
    await insertSale({ orgId: org, createdAt: at('2026-10-14T20:00:00'), totalCents: 400 })
    await insertSale({ orgId: org, createdAt: at('2026-10-15T09:00:00'), totalCents: 900 })
    const d = await dash('ayer', admin, org)
    expect(d.totals.totalCents).toBe(400)
    expect(d.range.from).toBe('2026-10-14')
  })
})

describe('getDashboard: comparación con el período previo', () => {
  it('hoy vs ayer, con variación porcentual', async () => {
    const org = await freshOrg()
    await insertSale({ orgId: org, createdAt: at('2026-10-14T10:00:00'), totalCents: 1000 })
    await insertSale({ orgId: org, createdAt: at('2026-10-15T10:00:00'), totalCents: 1500 })
    await insertSale({ orgId: org, createdAt: at('2026-10-15T11:00:00'), totalCents: 1500 })
    // Anteayer no cuenta para hoy vs ayer
    await insertSale({ orgId: org, createdAt: at('2026-10-13T10:00:00'), totalCents: 50000 })

    const d = await dash('hoy', admin, org)
    expect(d.previous).toEqual({ totalCents: 1000, count: 1, avgTicketCents: 1000 })
    expect(d.changes).toEqual({ total: 200, count: 100, avgTicket: 50 })
  })

  it('ayer vs anteayer', async () => {
    const org = await freshOrg()
    await insertSale({ orgId: org, createdAt: at('2026-10-13T10:00:00'), totalCents: 2000 })
    await insertSale({ orgId: org, createdAt: at('2026-10-14T10:00:00'), totalCents: 1000 })
    const d = await dash('ayer', admin, org)
    expect(d.previous.totalCents).toBe(2000)
    expect(d.changes.total).toBe(-50)
  })

  it('7 días vs los 7 días previos; el límite entre ambos es exacto', async () => {
    const org = await freshOrg()
    // Actual: 09-oct .. 15-oct. Previo: 02-oct .. 08-oct
    await insertSale({ orgId: org, createdAt: at('2026-10-09T00:00:00'), totalCents: 300 })
    await insertSale({ orgId: org, createdAt: at('2026-10-08T14:59:59'), totalCents: 200 })
    // Pasado el mismo avance (15:00 de hace 7 días): no cuenta
    await insertSale({ orgId: org, createdAt: at('2026-10-08T15:00:01'), totalCents: 8888 })
    await insertSale({ orgId: org, createdAt: at('2026-10-02T00:00:00'), totalCents: 100 })
    await insertSale({ orgId: org, createdAt: at('2026-10-01T23:59:59'), totalCents: 99999 })

    const d = await dash('7d', admin, org)
    expect(d.totals.totalCents).toBe(300)
    expect(d.previous.totalCents).toBe(300) // 200 + 100
    expect(d.changes.total).toBe(0)
    expect(d.previousRange).toEqual({ from: '2026-10-02', to: '2026-10-08' })
  })

  it('período previo sin ventas: variación null (sin dividir por cero)', async () => {
    const org = await freshOrg()
    await insertSale({ orgId: org, createdAt: at('2026-10-15T10:00:00'), totalCents: 1000 })
    const d = await dash('hoy', admin, org)
    expect(d.changes).toEqual({ total: null, count: null, avgTicket: null })
  })
})

describe('getDashboard: previo con el mismo avance', () => {
  it('a las 10:00 solo cuenta de ayer lo vendido hasta las 10:00', async () => {
    const org = await freshOrg()
    await insertSale({ orgId: org, createdAt: at('2026-10-14T09:00:00'), totalCents: 1000 })
    await insertSale({ orgId: org, createdAt: at('2026-10-14T15:00:00'), totalCents: 5000 })
    await insertSale({ orgId: org, createdAt: at('2026-10-15T09:30:00'), totalCents: 2000 })

    const d = await dash('hoy', admin, org, at('2026-10-15T10:00:00'))
    expect(d.previous.totalCents).toBe(1000)
    expect(d.changes.total).toBe(100)
    // El período actual no se recorta
    expect(d.totals.totalCents).toBe(2000)
  })
})

describe('getDashboard: por método de pago', () => {
  it('reparte el importe de las completadas por método', async () => {
    const org = await freshOrg()
    const day = at('2026-10-15T10:00:00')
    await insertSale({ orgId: org, createdAt: day, totalCents: 1000, method: 'efectivo' })
    await insertSale({ orgId: org, createdAt: day, totalCents: 250, method: 'efectivo' })
    await insertSale({ orgId: org, createdAt: day, totalCents: 400, method: 'yape_plin' })
    await insertSale({ orgId: org, createdAt: day, totalCents: 600, method: 'tarjeta' })
    await insertSale({
      orgId: org,
      createdAt: day,
      totalCents: 5000,
      method: 'tarjeta',
      status: 'anulada',
    })
    expect((await dash('hoy', admin, org)).byMethod).toEqual({
      efectivo: 1250,
      yape_plin: 400,
      tarjeta: 600,
    })
  })
})

describe('getDashboard: ventas por hora (Lima)', () => {
  it('23:30 de Lima cae en la hora 23 de ESE día (aunque en UTC ya sea el día siguiente)', async () => {
    const org = await freshOrg()
    await insertSale({ orgId: org, createdAt: at('2026-10-14T23:30:00'), totalCents: 700 })

    const ayer = await dash('ayer', admin, org)
    expect(ayer.buckets.kind).toBe('hour')
    expect(ayer.buckets.items[23].cents).toBe(700)
    expect(ayer.totals.totalCents).toBe(700)
    // Y no cuenta para hoy
    expect((await dash('hoy', admin, org)).totals.totalCents).toBe(0)
  })

  it('00:00 de Lima abre la hora 0 del día nuevo; 23:59:59 cierra la 23 del anterior', async () => {
    const org = await freshOrg()
    await insertSale({ orgId: org, createdAt: at('2026-10-15T00:00:00'), totalCents: 100 })
    await insertSale({ orgId: org, createdAt: at('2026-10-14T23:59:59'), totalCents: 40 })

    const hoy = await dash('hoy', admin, org)
    expect(hoy.buckets.items[0].cents).toBe(100)
    expect(hoy.buckets.items[23].cents).toBe(0)
    const ayer = await dash('ayer', admin, org)
    expect(ayer.buckets.items[23].cents).toBe(40)
  })

  it('agrupa varias ventas de la misma hora y devuelve siempre 24 buckets', async () => {
    const org = await freshOrg()
    await insertSale({ orgId: org, createdAt: at('2026-10-15T09:05:00'), totalCents: 100 })
    await insertSale({ orgId: org, createdAt: at('2026-10-15T09:55:00'), totalCents: 200 })
    await insertSale({ orgId: org, createdAt: at('2026-10-15T14:00:00'), totalCents: 50 })
    const { items } = (await dash('hoy', admin, org)).buckets
    expect(items).toHaveLength(24)
    expect(items[9]).toMatchObject({ cents: 300, count: 2 })
    expect(items[14]).toMatchObject({ cents: 50, count: 1 })
    expect(items[10]).toMatchObject({ cents: 0, count: 0 })
  })
})

describe('getDashboard: 7 días por día (Lima)', () => {
  it('7 buckets con fechas de Lima y ceros; 23:30 pertenece a su día', async () => {
    const org = await freshOrg()
    await insertSale({ orgId: org, createdAt: at('2026-10-09T00:00:00'), totalCents: 10 })
    await insertSale({ orgId: org, createdAt: at('2026-10-12T23:30:00'), totalCents: 20 })
    await insertSale({ orgId: org, createdAt: at('2026-10-15T08:00:00'), totalCents: 30 })
    await insertSale({ orgId: org, createdAt: at('2026-10-08T23:59:59'), totalCents: 9999 }) // fuera

    const { kind, items } = (await dash('7d', admin, org)).buckets
    expect(kind).toBe('day')
    expect(items.map((b) => b.key)).toEqual([
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
    ])
    expect(items.map((b) => b.cents)).toEqual([10, 0, 0, 20, 0, 0, 30])
    expect(items[6].label).toBe('Ju 15')
  })
})

describe('getDashboard: top productos', () => {
  it('ordena por unidades y desempata por importe; máximo 5', async () => {
    const org = await freshOrg()
    const mk = (name: string) => newProduct({ name }, org)
    const [a, b, c, d, e, f] = await Promise.all(['A', 'B', 'C', 'D', 'E', 'F'].map(mk))
    const when = at('2026-10-15T10:00:00')
    await insertSale({
      orgId: org,
      createdAt: when,
      items: [
        { productId: a, qty: 5, unitPriceCents: 100, name: 'A' }, // 5 u, 500
        { productId: b, qty: 5, unitPriceCents: 300, name: 'B' }, // 5 u, 1500 -> gana el empate
        { productId: c, qty: 3, unitPriceCents: 100, name: 'C' },
        { productId: d, qty: 2, unitPriceCents: 100, name: 'D' },
        { productId: e, qty: 1, unitPriceCents: 900, name: 'E' },
        { productId: f, qty: 1, unitPriceCents: 100, name: 'F' }, // queda fuera
      ],
    })
    const top = (await dash('hoy', admin, org)).topProducts
    expect(top.map((t) => t.name)).toEqual(['B', 'A', 'C', 'D', 'E'])
    expect(top[0]).toMatchObject({ units: 5, cents: 1500 })
  })

  it('suma el mismo producto entre ventas, usa el nombre snapshot y excluye anuladas/pendientes', async () => {
    const org = await freshOrg()
    const p = await newProduct({ name: 'Nombre actual' }, org)
    const q = await newProduct({ name: 'Otro' }, org)
    await insertSale({
      orgId: org,
      createdAt: at('2026-10-15T09:00:00'),
      items: [{ productId: p, qty: 2, unitPriceCents: 100, name: 'Nombre viejo' }],
    })
    await insertSale({
      orgId: org,
      createdAt: at('2026-10-15T10:00:00'),
      items: [{ productId: p, qty: 1, unitPriceCents: 100, name: 'Nombre nuevo' }],
    })
    await insertSale({
      orgId: org,
      createdAt: at('2026-10-15T11:00:00'),
      status: 'anulada',
      items: [{ productId: q, qty: 50, unitPriceCents: 100, name: 'Otro' }],
    })
    await insertSale({
      orgId: org,
      createdAt: at('2026-10-15T11:30:00'),
      status: 'pendiente',
      items: [{ productId: q, qty: 40, unitPriceCents: 100, name: 'Otro' }],
    })
    expect((await dash('hoy', admin, org)).topProducts).toEqual([
      { productId: p, name: 'Nombre nuevo', units: 3, cents: 300 },
    ])
  })
})

describe('getDashboard: cajero y bodegas', () => {
  it('el cajero ve solo sus cifras; admin y propietario ven todo', async () => {
    const org = await freshOrg()
    const day = at('2026-10-15T10:00:00')
    await insertSale({ orgId: org, createdAt: day, totalCents: 1000, cashierId: ANA })
    await insertSale({ orgId: org, createdAt: day, totalCents: 4000, cashierId: LUIS })
    await insertSale({
      orgId: org,
      createdAt: day,
      totalCents: 800,
      cashierId: LUIS,
      status: 'anulada',
    })
    await insertSale({
      orgId: org,
      createdAt: at('2026-10-14T10:00:00'),
      totalCents: 300,
      cashierId: ANA,
    })
    await insertSale({
      orgId: org,
      createdAt: at('2026-10-14T10:00:00'),
      totalCents: 900,
      cashierId: LUIS,
    })
    const p = await newProduct({ name: 'Solo Luis' }, org)
    await insertSale({
      orgId: org,
      createdAt: day,
      cashierId: LUIS,
      items: [{ productId: p, qty: 9, unitPriceCents: 10, name: 'Solo Luis' }],
    })

    const mine = await dash('hoy', ana, org)
    expect(mine.ownSalesOnly).toBe(true)
    expect(mine.totals).toEqual({ totalCents: 1000, count: 1, avgTicketCents: 1000 })
    expect(mine.previous.totalCents).toBe(300)
    expect(mine.voidedCount).toBe(0)
    expect(mine.byMethod.efectivo).toBe(1000)
    expect(mine.buckets.items.reduce((a, b) => a + b.cents, 0)).toBe(1000)
    expect(mine.topProducts).toEqual([])

    for (const v of [admin, owner]) {
      const all = await dash('hoy', v, org)
      expect(all.ownSalesOnly).toBe(false)
      expect(all.totals.totalCents).toBe(1000 + 4000 + 90)
      expect(all.voidedCount).toBe(1)
      expect(all.topProducts[0].name).toBe('Solo Luis')
    }
  })

  it('un rol desconocido se trata como cajero (ante la duda, ve menos)', async () => {
    const org = await freshOrg()
    await insertSale({
      orgId: org,
      createdAt: at('2026-10-15T10:00:00'),
      totalCents: 500,
      cashierId: LUIS,
    })
    const d = await dash('hoy', { userId: ANA, role: 'otro' }, org)
    expect(d.ownSalesOnly).toBe(true)
    expect(d.totals.count).toBe(0)
  })

  it('aísla las bodegas', async () => {
    const orgA = await freshOrg()
    const orgB = await freshOrg()
    await insertSale({ orgId: orgA, createdAt: at('2026-10-15T10:00:00'), totalCents: 100 })
    await insertSale({ orgId: orgB, createdAt: at('2026-10-15T10:00:00'), totalCents: 7000 })
    await insertSale({
      orgId: orgB,
      createdAt: at('2026-10-15T10:00:00'),
      totalCents: 7000,
      status: 'pendiente',
    })
    await newProduct({ name: 'Ajeno', stock: 0 }, orgB)

    const d = await dash('hoy', admin, orgA)
    expect(d.totals.totalCents).toBe(100)
    expect(d.pendingCount).toBe(0)
    expect(d.stock.out.count).toBe(0)
  })
})

describe('getDashboard: alertas', () => {
  it('cuenta stock bajo y agotados solo de productos activos que controlan stock', async () => {
    const org = await freshOrg()
    await newProduct({ name: 'Bajo 1', stock: 2, minStock: 5 }, org)
    await newProduct({ name: 'Bajo borde', stock: 5, minStock: 5 }, org) // stock = mínimo -> bajo
    await newProduct({ name: 'Ok', stock: 6, minStock: 5 }, org)
    await newProduct({ name: 'Agotado', stock: 0, minStock: 3 }, org)
    await newProduct({ name: 'Agotado sin mínimo', stock: 0, minStock: 0 }, org)
    await newProduct({ name: 'Inactivo agotado', stock: 0, active: false }, org)
    await newProduct({ name: 'Inactivo bajo', stock: 1, minStock: 5, active: false }, org)
    await newProduct({ name: 'Preparado', stock: 0, minStock: 5, tracksStock: false }, org)

    for (const v of [admin, ana]) {
      // El cajero también ve el stock de la bodega
      const d = await dash('hoy', v, org)
      expect(d.stock.low).toEqual({ count: 2, names: ['Bajo 1', 'Bajo borde'] })
      expect(d.stock.out.count).toBe(2)
      expect(d.stock.out.names).toEqual(['Agotado', 'Agotado sin mínimo'])
    }
  })

  it('lista como máximo 5 nombres pero cuenta todos', async () => {
    const org = await freshOrg()
    for (let i = 1; i <= 7; i++) await newProduct({ name: `Agotado ${i}`, stock: 0 }, org)
    const d = await dash('hoy', admin, org)
    expect(d.stock.out.count).toBe(7)
    expect(d.stock.out.names).toEqual([
      'Agotado 1',
      'Agotado 2',
      'Agotado 3',
      'Agotado 4',
      'Agotado 5',
    ])
  })

  it('ventas por validar: de toda la bodega y solo para quien puede aprobar', async () => {
    const org = await freshOrg()
    await insertSale({ orgId: org, createdAt: at('2026-10-15T10:00:00'), status: 'pendiente' })
    // Una pendiente de hace semanas sigue contando (no es del período)
    await insertSale({ orgId: org, createdAt: at('2026-09-01T10:00:00'), status: 'pendiente' })
    await insertSale({ orgId: org, createdAt: at('2026-10-15T10:00:00') })

    expect((await dash('hoy', admin, org)).pendingCount).toBe(2)
    expect((await dash('hoy', owner, org)).pendingCount).toBe(2)
    expect((await dash('hoy', ana, org)).pendingCount).toBeNull()
  })

  it('anuladas: se cuentan dentro del período', async () => {
    const org = await freshOrg()
    await insertSale({ orgId: org, createdAt: at('2026-10-15T10:00:00'), status: 'anulada' })
    await insertSale({ orgId: org, createdAt: at('2026-10-15T11:00:00'), status: 'anulada' })
    await insertSale({ orgId: org, createdAt: at('2026-10-14T11:00:00'), status: 'anulada' })
    expect((await dash('hoy', admin, org)).voidedCount).toBe(2)
    expect((await dash('7d', admin, org)).voidedCount).toBe(3)
  })
})

describe('getDashboard: precios editados', () => {
  it('cuenta ventas completadas y por validar con líneas manuales y su diferencia neta; excluye anuladas y otros períodos', async () => {
    const org = await freshOrg()
    const prod = await newProduct({}, org)
    const day = at('2026-10-15T10:00:00')
    const edit = (manualTotalCents: number, qty = 2) => ({
      productId: prod,
      qty,
      unitPriceCents: 300,
      name: 'Inca Kola',
      manualTotalCents,
    })
    // descuento 1.50
    await insertSale({ orgId: org, createdAt: day, items: [edit(450)] })
    // cobrado de más: 2.00 (por validar también cuenta)
    await insertSale({
      orgId: org,
      createdAt: day,
      status: 'pendiente',
      cashierId: LUIS,
      items: [edit(800, 2)],
    })
    // anulada: no cuenta
    await insertSale({ orgId: org, createdAt: day, status: 'anulada', items: [edit(100)] })
    // otro día: fuera de "hoy"
    await insertSale({ orgId: org, createdAt: at('2026-10-10T10:00:00'), items: [edit(100)] })
    // sin edición: no cuenta
    await insertSale({
      orgId: org,
      createdAt: day,
      items: [{ productId: prod, qty: 1, unitPriceCents: 300, name: 'Inca Kola' }],
    })

    const d = await dash('hoy', admin, org)
    expect(d.editedPrices).toEqual({ count: 2, differenceCents: 150 - 200 })
    const o = await dash('hoy', owner, org)
    expect(o.editedPrices).toEqual({ count: 2, differenceCents: -50 })
  })

  it('el cajero no ve la tarjeta (null)', async () => {
    const org = await freshOrg()
    const prod = await newProduct({}, org)
    await insertSale({
      orgId: org,
      createdAt: at('2026-10-15T10:00:00'),
      cashierId: ANA,
      items: [{ productId: prod, qty: 2, unitPriceCents: 300, name: 'X', manualTotalCents: 450 }],
    })
    expect((await dash('hoy', ana, org)).editedPrices).toBeNull()
  })

  it('sin ediciones: count 0 y diferencia 0', async () => {
    const org = await freshOrg()
    expect((await dash('hoy', admin, org)).editedPrices).toEqual({ count: 0, differenceCents: 0 })
  })
})
