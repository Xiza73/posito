import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import { organization, user } from './auth-schema'

export * from './auth-schema'

// Convenciones: dinero en céntimos (integer), fechas con zona horaria, todo dato de negocio
// pertenece a una organization (= una bodega). Ver CLAUDE.md §1.

const id = () => uuid().primaryKey().defaultRandom()
const orgId = () =>
  text()
    .notNull()
    .references(() => organization.id, { onDelete: 'cascade' })
const createdAt = () => timestamp({ withTimezone: true }).defaultNow().notNull()
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date())

export const paymentMethod = pgEnum('payment_method', ['efectivo', 'yape_plin', 'tarjeta'])
export const saleStatus = pgEnum('sale_status', ['completada', 'anulada'])
export const stockMovementType = pgEnum('stock_movement_type', [
  'venta',
  'anulacion',
  'ingreso',
  'ajuste',
])
export const documentType = pgEnum('document_type', ['dni', 'ruc', 'ce'])

export const category = pgTable(
  'category',
  {
    id: id(),
    organizationId: orgId(),
    name: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('category_org_name_uq').on(t.organizationId, t.name)],
)

export const product = pgTable(
  'product',
  {
    id: id(),
    organizationId: orgId(),
    categoryId: uuid().references(() => category.id, { onDelete: 'set null' }),
    name: text().notNull(),
    barcode: text(),
    priceCents: integer().notNull(),
    // false = se prepara al momento (ej. café pasado): no descuenta stock
    tracksStock: boolean().default(true).notNull(),
    // Caché de SUM(stock_movement.quantity); se actualiza en la misma transacción
    stock: integer().default(0).notNull(),
    minStock: integer().default(0).notNull(),
    active: boolean().default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('product_org_idx').on(t.organizationId),
    uniqueIndex('product_org_barcode_uq').on(t.organizationId, t.barcode),
    check('product_price_non_negative', sql`${t.priceCents} >= 0`),
    check('product_stock_non_negative', sql`${t.stock} >= 0`),
    check('product_min_stock_non_negative', sql`${t.minStock} >= 0`),
  ],
)

export const customer = pgTable(
  'customer',
  {
    id: id(),
    organizationId: orgId(),
    name: text().notNull(),
    documentType: documentType(),
    documentNumber: text(),
    phone: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('customer_org_idx').on(t.organizationId),
    uniqueIndex('customer_org_document_uq').on(t.organizationId, t.documentNumber),
  ],
)

export const sale = pgTable(
  'sale',
  {
    id: id(),
    organizationId: orgId(),
    // Correlativo tipo B001-00038; el contador se implementa con el flujo de cobro
    series: text().notNull(),
    number: integer().notNull(),
    cashierId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    // null = "público general"
    customerId: uuid().references(() => customer.id, { onDelete: 'set null' }),
    paymentMethod: paymentMethod().notNull(),
    // IGV incluido: subtotal + igv = total (ver features/caja/lib/totals.ts)
    subtotalCents: integer().notNull(),
    igvCents: integer().notNull(),
    totalCents: integer().notNull(),
    status: saleStatus().default('completada').notNull(),
    voidedAt: timestamp({ withTimezone: true }),
    voidedById: text().references(() => user.id, { onDelete: 'restrict' }),
    voidReason: text(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('sale_org_series_number_uq').on(t.organizationId, t.series, t.number),
    index('sale_org_created_idx').on(t.organizationId, t.createdAt),
    check('sale_totals_consistent', sql`${t.subtotalCents} + ${t.igvCents} = ${t.totalCents}`),
    check('sale_total_non_negative', sql`${t.totalCents} >= 0`),
    check(
      'sale_void_consistent',
      sql`(${t.status} = 'anulada') = (${t.voidedAt} is not null and ${t.voidedById} is not null)`,
    ),
  ],
)

export const saleItem = pgTable(
  'sale_item',
  {
    id: id(),
    saleId: uuid()
      .notNull()
      .references(() => sale.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => product.id, { onDelete: 'restrict' }),
    // Snapshot: si el producto cambia de nombre o precio, la venta histórica no cambia
    productName: text().notNull(),
    unitPriceCents: integer().notNull(),
    quantity: integer().notNull(),
    lineTotalCents: integer().notNull(),
  },
  (t) => [
    index('sale_item_sale_idx').on(t.saleId),
    check('sale_item_quantity_positive', sql`${t.quantity} > 0`),
    check('sale_item_line_total', sql`${t.lineTotalCents} = ${t.unitPriceCents} * ${t.quantity}`),
  ],
)

// Fuente de verdad del inventario: append-only, nunca se edita ni se borra
export const stockMovement = pgTable(
  'stock_movement',
  {
    id: id(),
    organizationId: orgId(),
    productId: uuid()
      .notNull()
      .references(() => product.id, { onDelete: 'restrict' }),
    type: stockMovementType().notNull(),
    // Con signo: venta = negativo, ingreso/anulación = positivo, ajuste = cualquiera
    quantity: integer().notNull(),
    saleId: uuid().references(() => sale.id, { onDelete: 'restrict' }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    reason: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index('stock_movement_product_created_idx').on(t.productId, t.createdAt),
    check('stock_movement_quantity_non_zero', sql`${t.quantity} <> 0`),
    check(
      'stock_movement_sale_link',
      sql`(${t.type} in ('venta', 'anulacion')) = (${t.saleId} is not null)`,
    ),
  ],
)

export const categoryRelations = relations(category, ({ many }) => ({
  products: many(product),
}))

export const productRelations = relations(product, ({ one, many }) => ({
  category: one(category, { fields: [product.categoryId], references: [category.id] }),
  stockMovements: many(stockMovement),
}))

export const customerRelations = relations(customer, ({ many }) => ({
  sales: many(sale),
}))

export const saleRelations = relations(sale, ({ one, many }) => ({
  cashier: one(user, { fields: [sale.cashierId], references: [user.id] }),
  customer: one(customer, { fields: [sale.customerId], references: [customer.id] }),
  items: many(saleItem),
}))

export const saleItemRelations = relations(saleItem, ({ one }) => ({
  sale: one(sale, { fields: [saleItem.saleId], references: [sale.id] }),
  product: one(product, { fields: [saleItem.productId], references: [product.id] }),
}))

export const stockMovementRelations = relations(stockMovement, ({ one }) => ({
  product: one(product, { fields: [stockMovement.productId], references: [product.id] }),
  sale: one(sale, { fields: [stockMovement.saleId], references: [sale.id] }),
}))
