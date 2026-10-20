import { nameKey, normalizeDisplayName } from '@/lib/name-key'
import type { ImportField, RawImportRow } from './import-parse'
import { productInputSchema } from './schemas'

// Validación y clasificación PURAS de las filas importadas (sin DB): el servidor las ejecuta
// dos veces (vista previa y confirmación) con el catálogo vigente de la bodega.

export type RowError = { field: ImportField; message: string }

/** Producto ya normalizado, listo para escribir (nombre y categoría con su `name_key`). */
export type ProductImportInput = {
  name: string
  nameKey: string
  barcode: string | null
  priceCents: number
  /** null = el archivo no trae costo (en existentes: conservar el actual). */
  costCents: number | null
  categoryName: string | null
  categoryKey: string | null
  tracksStock: boolean
  /** Ya es 0 si no controla stock. */
  stock: number
  minStock: number
}

export type ValidatedRow = { line: number; input?: ProductImportInput; errors: RowError[] }

const YES = new Set(['si', '1', 'true'])
const NO = new Set(['no', '0', 'false'])

/** "" -> sí (por defecto); si/sí/1/true -> sí; no/0/false -> no; otra cosa -> null. */
export function parseTracksStock(value: string): boolean | null {
  const key = nameKey(value)
  if (key === '') return true
  if (YES.has(key)) return true
  if (NO.has(key)) return false
  return null
}

// Zod nombra los campos como el formulario; aquí se traducen a las columnas del archivo.
const ZOD_FIELD: Record<string, ImportField> = {
  name: 'name',
  priceCents: 'price',
  costCents: 'cost',
  categoryName: 'category',
  barcode: 'barcode',
  initialStock: 'stock',
  minStock: 'minStock',
}

const MESSAGE_OVERRIDES: Partial<Record<ImportField, string>> = {
  stock: 'El stock debe ser un número entero (0 o más)',
  minStock: 'El stock mínimo debe ser un número entero (0 o más)',
}

export function validateRow(raw: RawImportRow): ValidatedRow {
  const errors: RowError[] = []
  const tracksStock = parseTracksStock(raw.tracksStock)
  if (tracksStock === null) {
    errors.push({ field: 'tracksStock', message: 'Escribe sí o no (o déjalo vacío para sí)' })
  }

  const parsed = productInputSchema.safeParse({
    name: raw.name,
    barcode: raw.barcode,
    priceCents: raw.price,
    costCents: raw.cost,
    categoryName: raw.category,
    tracksStock: tracksStock ?? true,
    initialStock: raw.stock,
    minStock: raw.minStock,
  })
  if (!parsed.success) {
    const seen = new Set<ImportField>()
    for (const issue of parsed.error.issues) {
      const field = ZOD_FIELD[String(issue.path[0])]
      if (!field || seen.has(field)) continue
      seen.add(field)
      errors.push({ field, message: MESSAGE_OVERRIDES[field] ?? issue.message })
    }
  }
  if (errors.length > 0 || !parsed.success) return { line: raw.line, errors }

  const d = parsed.data
  return {
    line: raw.line,
    errors,
    input: {
      name: normalizeDisplayName(d.name),
      nameKey: nameKey(d.name),
      barcode: d.barcode,
      priceCents: d.priceCents,
      costCents: d.costCents ?? null,
      categoryName: d.categoryName ? normalizeDisplayName(d.categoryName) : null,
      categoryKey: d.categoryName ? nameKey(d.categoryName) : null,
      tracksStock: d.tracksStock,
      stock: d.tracksStock ? d.initialStock : 0,
      minStock: d.tracksStock ? d.minStock : 0,
    },
  }
}

export const validateRows = (raw: RawImportRow[]): ValidatedRow[] => raw.map(validateRow)

export type ExistingProduct = {
  id: string
  name: string
  nameKey: string
  barcode: string | null
  tracksStock: boolean
  priceCents: number
  /** Tiene precios por mayor: su precio solo se cambia desde el producto. */
  hasTiers: boolean
}

export type ExistingIndex = {
  byKey: Map<string, ExistingProduct>
  byBarcode: Map<string, ExistingProduct>
}

export function indexExisting(products: ExistingProduct[]): ExistingIndex {
  const byKey = new Map<string, ExistingProduct>()
  const byBarcode = new Map<string, ExistingProduct>()
  for (const p of products) {
    byKey.set(p.nameKey, p)
    if (p.barcode) byBarcode.set(p.barcode, p)
  }
  return { byKey, byBarcode }
}

export const TIERED_PRICE_MESSAGE = 'Tiene precios por mayor: cambia su precio desde el producto'

export type ImportStatus = 'new' | 'existing' | 'duplicate' | 'error'

export type ClassifiedRow = {
  line: number
  status: ImportStatus
  input?: ProductImportInput
  errors: RowError[]
  /** status 'existing': el producto de la bodega que coincide. */
  existing?: ExistingProduct
  /** status 'duplicate': fila anterior del archivo con el mismo nombre o código. */
  duplicateOfLine?: number
}

/**
 * Asigna el estado a cada fila, EN ORDEN (la primera aparición gana):
 * - error: no pasó la validación, o su código de barras es de otro producto.
 * - duplicate: mismo nombre o código que una fila anterior válida del archivo.
 * - existing: mismo `name_key` que un producto de la bodega.
 * - new: lo demás.
 * Un código de barras de la bodega solo es compatible con el producto del mismo nombre.
 */
export function classify(
  rows: ValidatedRow[],
  existing: ExistingIndex,
  { blockTieredPriceChange = true }: { blockTieredPriceChange?: boolean } = {},
): ClassifiedRow[] {
  const seenKeys = new Map<string, number>()
  const seenBarcodes = new Map<string, number>()

  return rows.map((row): ClassifiedRow => {
    const { input } = row
    if (!input || row.errors.length > 0) {
      return { line: row.line, status: 'error', errors: row.errors }
    }

    const earlier =
      seenKeys.get(input.nameKey) ?? (input.barcode ? seenBarcodes.get(input.barcode) : undefined)
    if (earlier !== undefined) {
      return { line: row.line, status: 'duplicate', input, errors: [], duplicateOfLine: earlier }
    }

    const byName = existing.byKey.get(input.nameKey)
    const byBarcode = input.barcode ? existing.byBarcode.get(input.barcode) : undefined
    if (byBarcode && byBarcode.id !== byName?.id) {
      return {
        line: row.line,
        status: 'error',
        input,
        errors: [
          {
            field: 'barcode',
            message: `El código de barras pertenece a otro producto (${byBarcode.name})`,
          },
        ],
      }
    }

    // Cambiar el precio normal de un producto con niveles dejaría los niveles incoherentes (p. ej.
    // descuentos enormes si sube): solo se permite desde el formulario del producto.
    if (blockTieredPriceChange && byName?.hasTiers && byName.priceCents !== input.priceCents) {
      return {
        line: row.line,
        status: 'error',
        input,
        errors: [{ field: 'price', message: TIERED_PRICE_MESSAGE }],
      }
    }

    seenKeys.set(input.nameKey, row.line)
    if (input.barcode) seenBarcodes.set(input.barcode, row.line)
    return byName
      ? { line: row.line, status: 'existing', input, errors: [], existing: byName }
      : { line: row.line, status: 'new', input, errors: [] }
  })
}

// --- Contratos entre servidor y cliente ---

export type PreviewRow = {
  line: number
  status: ImportStatus
  name: string
  category: string
  /** Texto del archivo, para mostrar tal cual si no se pudo interpretar. */
  price: string
  priceCents: number | null
  stock: string
  tracksStock: boolean
  errors: RowError[]
  /** Aclaración corta: a qué producto/fila corresponde. */
  note: string | null
}

export type ImportCounts = Record<ImportStatus, number>

export type ImportPreview = { counts: ImportCounts; rows: PreviewRow[] }

export type ImportSummary = {
  created: number
  updated: number
  skipped: number
  errors: number
}

export function countByStatus(rows: { status: ImportStatus }[]): ImportCounts {
  const counts: ImportCounts = { new: 0, existing: 0, duplicate: 0, error: 0 }
  for (const r of rows) counts[r.status]++
  return counts
}

export function toPreview(raw: RawImportRow[], classified: ClassifiedRow[]): ImportPreview {
  const rows = classified.map((c, i): PreviewRow => {
    const r = raw[i]
    const note =
      c.status === 'existing'
        ? `Coincide con «${c.existing?.name}»`
        : c.status === 'duplicate'
          ? `Igual a la fila ${c.duplicateOfLine}`
          : null
    return {
      line: c.line,
      status: c.status,
      name: c.input?.name ?? r.name,
      category: c.input?.categoryName ?? r.category,
      price: r.price,
      priceCents: c.input?.priceCents ?? null,
      stock: c.input ? String(c.input.stock) : r.stock,
      tracksStock: c.input?.tracksStock ?? true,
      errors: c.errors,
      note,
    }
  })
  return { counts: countByStatus(rows), rows }
}
