import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
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
// 'pendiente' = vendida (descontó stock y tomó correlativo) a la espera de que un admin la apruebe
// o rechace. OJO migraciones: un valor nuevo de enum no se puede USAR en la transacción que lo agrega,
// y drizzle corre TODAS las migraciones pendientes en una sola. Por eso ningún CHECK/DDL debe
// nombrar 'pendiente' (ver CLAUDE.md §7).
export const saleStatus = pgEnum('sale_status', ['completada', 'anulada', 'pendiente'])
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
    // Clave de comparación (src/lib/name-key.ts); `name` es solo para mostrar
    nameKey: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('category_org_name_uq').on(t.organizationId, t.nameKey)],
)

export const product = pgTable(
  'product',
  {
    id: id(),
    organizationId: orgId(),
    categoryId: uuid().references(() => category.id, { onDelete: 'set null' }),
    name: text().notNull(),
    nameKey: text().notNull(),
    barcode: text(),
    priceCents: integer().notNull(),
    // false = se prepara al momento (ej. café pasado): no descuenta stock
    tracksStock: boolean().default(true).notNull(),
    // Caché de SUM(stock_movement.quantity); se actualiza en la misma transacción
    stock: integer().default(0).notNull(),
    minStock: integer().default(0).notNull(),
    active: boolean().default(true).notNull(),
    // Base `${orgId}/${productId}/${uuid}` en Supabase Storage (src/lib/product-image.ts); null = sin foto
    imagePath: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('product_org_idx').on(t.organizationId),
    uniqueIndex('product_org_name_key_uq').on(t.organizationId, t.nameKey),
    uniqueIndex('product_org_barcode_uq').on(t.organizationId, t.barcode),
    check('product_price_non_negative', sql`${t.priceCents} >= 0`),
    check('product_stock_non_negative', sql`${t.stock} >= 0`),
    check('product_min_stock_non_negative', sql`${t.minStock} >= 0`),
    // Defensa en profundidad: orgId (alfanumérico, ids de Better Auth) / productId / uuid de la imagen
    check(
      'product_image_path_format',
      sql`${t.imagePath} is null or ${t.imagePath} ~ '^[A-Za-z0-9_-]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`,
    ),
  ],
)

// Subida de foto de UN SOLO USO: el id ES el uuid de la imagen (`${orgId}/${productId}/${id}-800.webp`).
// confirmProductImage exige una fila pendiente (no consumida, de menos de 1 h) y la consume en la
// misma transacción que guarda product.image_path. Las vencidas se limpian (objetos + fila).
export const productImageUpload = pgTable(
  'product_image_upload',
  {
    id: uuid().primaryKey(),
    organizationId: orgId(),
    productId: uuid()
      .notNull()
      .references(() => product.id, { onDelete: 'cascade' }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    consumedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('product_image_upload_org_idx').on(t.organizationId, t.consumedAt, t.createdAt)],
)

export const customer = pgTable(
  'customer',
  {
    id: id(),
    organizationId: orgId(),
    name: text().notNull(),
    // Clave de búsqueda (src/lib/name-key.ts). SIN índice único: dos "Juan Pérez" pueden existir.
    nameKey: text().notNull(),
    // Documento normalizado (src/lib/document.ts); tipo y número van juntos o ninguno
    documentType: documentType(),
    documentNumber: text(),
    phone: text(),
    email: text(),
    address: text(),
    // false = desactivado: no se borra (hay ventas que lo referencian) ni aparece en la caja
    active: boolean().default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('customer_org_idx').on(t.organizationId),
    index('customer_org_name_key_idx').on(t.organizationId, t.nameKey),
    // Por tipo + número: un CE de 11 dígitos podría coincidir con un RUC y son personas distintas
    uniqueIndex('customer_org_document_uq').on(t.organizationId, t.documentType, t.documentNumber),
    check(
      'customer_document_pair',
      sql`(${t.documentType} is null) = (${t.documentNumber} is null)`,
    ),
  ],
)

export const sale = pgTable(
  'sale',
  {
    id: id(),
    organizationId: orgId(),
    // Correlativo tipo B001-00038; el siguiente número sale de receipt_series (ver checkout.ts)
    series: text().notNull(),
    number: integer().notNull(),
    cashierId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    // null = "público general"
    customerId: uuid().references(() => customer.id, { onDelete: 'set null' }),
    // Snapshot del cliente al cobrar (como sale_item.productName): editar el cliente después NO
    // cambia lo impreso en las boletas pasadas. El nombre/documento SIEMPRE se leen de aquí.
    customerName: text(),
    customerDocumentType: documentType(),
    customerDocumentNumber: text(),
    // Snapshot de los datos del negocio al cobrar (BusinessSnapshot, version 1): la boleta lo lee
    // de aquí; null = venta anterior a la función (se usa el perfil vigente como respaldo).
    businessSnapshot: jsonb(),
    paymentMethod: paymentMethod().notNull(),
    // IGV incluido: subtotal + igv = total (ver features/caja/lib/totals.ts)
    subtotalCents: integer().notNull(),
    igvCents: integer().notNull(),
    totalCents: integer().notNull(),
    status: saleStatus().default('completada').notNull(),
    voidedAt: timestamp({ withTimezone: true }),
    voidedById: text().references(() => user.id, { onDelete: 'restrict' }),
    voidReason: text(),
    // Quien aprobó una venta que estaba pendiente (null = nunca pasó por validación)
    approvedAt: timestamp({ withTimezone: true }),
    approvedById: text().references(() => user.id, { onDelete: 'restrict' }),
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
    check('sale_approval_consistent', sql`(${t.approvedAt} is null) = (${t.approvedById} is null)`),
    // Con cliente hay snapshot de nombre. (customer_id puede quedar null si el cliente se borrara
    // a mano: el snapshot sobrevive, por eso no es una igualdad.)
    check('sale_customer_snapshot', sql`${t.customerId} is null or ${t.customerName} is not null`),
    check(
      'sale_customer_document_pair',
      sql`(${t.customerDocumentType} is null) = (${t.customerDocumentNumber} is null)`,
    ),
  ],
)

// Ajustes de negocio por bodega (una fila por organization; sin fila = valores por defecto).
// Aquí vivirán los futuros ajustes de la bodega.
export const organizationSettings = pgTable('organization_settings', {
  organizationId: text()
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  // true = las ventas de los cajeros quedan 'pendiente' hasta que un admin las apruebe
  requireSaleApproval: boolean().default(false).notNull(),
  // Datos del negocio (todos opcionales; los valores por defecto se resuelven en
  // lib/settings.ts: tradeName vacío = nombre de la organization, receiptFooter vacío = agradecimiento)
  tradeName: text(),
  legalName: text(),
  ruc: text(),
  address: text(),
  phone: text(),
  branchName: text(),
  receiptFooter: text(),
  updatedAt: updatedAt(),
})

// Contador de boletas por bodega: una fila por organization. El cobro la incrementa con un
// upsert atómico (el bloqueo de fila serializa los cobros concurrentes).
export const receiptSeries = pgTable(
  'receipt_series',
  {
    organizationId: text()
      .primaryKey()
      .references(() => organization.id, { onDelete: 'cascade' }),
    // Formato SUNAT de boleta: B + 3 dígitos
    series: text().notNull(),
    // Último número emitido; el siguiente es lastNumber + 1
    lastNumber: integer().default(0).notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('receipt_series_format', sql`${t.series} ~ '^B[0-9]{3}$'`),
    check('receipt_series_last_number_non_negative', sql`${t.lastNumber} >= 0`),
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
    // Anular busca los movimientos de UNA venta: sin este índice recorre toda la tabla con locks tomados
    index('stock_movement_sale_idx').on(t.saleId),
    // Red de seguridad en la DB: una venta no puede descontar ni devolver dos veces el mismo
    // producto, aunque un refactor futuro rompa el lock de la app (saleId null = distinto en Postgres)
    uniqueIndex('stock_movement_sale_product_type_uq').on(t.saleId, t.productId, t.type),
    check('stock_movement_quantity_non_zero', sql`${t.quantity} <> 0`),
    check(
      'stock_movement_sign_by_type',
      sql`(${t.type} <> 'venta' or ${t.quantity} < 0) and (${t.type} not in ('anulacion', 'ingreso') or ${t.quantity} > 0)`,
    ),
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
