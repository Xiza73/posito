import { buildCsv } from '@/lib/csv'
import { type StockStatus, stockStatus } from '@/lib/stock-status'

/** Fila de exportación del stock (serializable). */
export type StockCsvRow = {
  name: string
  categoryName: string | null
  barcode: string | null
  stock: number
  minStock: number
  tracksStock: boolean
  active: boolean
}

export const STOCK_CSV_HEADERS = [
  'Producto',
  'Categoría',
  'Código',
  'Stock',
  'Stock mínimo',
  'Estado',
  'Activo',
] as const

export const STOCK_STATUS_LABELS = {
  ok: 'OK',
  low: 'Stock bajo',
  out: 'Agotado',
  untracked: 'No controla stock',
} as const satisfies Record<StockStatus, string>

function rowCells(r: StockCsvRow): string[] {
  const tracked = r.tracksStock
  return [
    r.name,
    r.categoryName ?? '',
    r.barcode ?? '',
    // Sin control de stock el número no significa nada: celda vacía
    tracked ? String(r.stock) : '',
    tracked ? String(r.minStock) : '',
    STOCK_STATUS_LABELS[stockStatus(r)],
    r.active ? 'Sí' : 'No',
  ]
}

/** CSV del inventario actual (UTF-8 con BOM, CRLF; texto de usuario neutralizado contra fórmulas). */
export function stockToCsv(rows: StockCsvRow[]): string {
  return buildCsv([STOCK_CSV_HEADERS, ...rows.map(rowCells)])
}
