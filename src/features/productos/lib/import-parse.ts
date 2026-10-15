import { nameKey } from '@/lib/name-key'

// Lectura de archivos de importación (CSV / hoja de Excel) a filas de TEXTO crudo. Todo es puro y
// corre en el cliente (evita el límite de tamaño del cuerpo de las Server Actions). La validación
// de los valores vive en import-validate.ts.

export const IMPORT_MAX_ROWS = 2000
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024

export const IMPORT_FIELDS = [
  'name',
  'price',
  'category',
  'barcode',
  'stock',
  'minStock',
  'tracksStock',
] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]

/** Una fila del archivo, todo texto. `line` = número de fila del archivo (el encabezado es la 1). */
export type RawImportRow = { line: number } & Record<ImportField, string>

export type ParseResult = { ok: true; rows: RawImportRow[] } | { ok: false; error: string }

/** Etiqueta de cada columna tal como se llama en la plantilla (para mensajes). */
export const FIELD_LABELS: Record<ImportField, string> = {
  name: 'nombre',
  price: 'precio',
  category: 'categoria',
  barcode: 'codigo_barras',
  stock: 'stock',
  minStock: 'stock_minimo',
  tracksStock: 'controla_stock',
}

// Encabezados aceptados, ya pasados por headerKey (sin tildes/mayúsculas, "_" y "-" como espacio).
const HEADER_ALIASES: Record<string, ImportField> = {
  nombre: 'name',
  precio: 'price',
  categoria: 'category',
  'codigo barras': 'barcode',
  'codigo de barras': 'barcode',
  stock: 'stock',
  'stock minimo': 'minStock',
  'controla stock': 'tracksStock',
}

const headerKey = (s: string) => nameKey(s.replace(/[_-]+/g, ' '))

export const IMPORT_TEMPLATE_CSV = `﻿${[
  'nombre,precio,categoria,codigo_barras,stock,stock_minimo,controla_stock',
  'Inca Kola 500 ml,3.50,Bebidas,7750001000011,24,6,si',
  'Arroz extra 1 kg,4.80,Abarrotes,,10,3,si',
].join('\r\n')}\r\n`

/**
 * Decodifica los bytes de un CSV. Excel en Windows guarda "CSV (delimitado por comas)" en
 * Windows-1252, no en UTF-8: si no es UTF-8 válido se reintenta como Windows-1252 para no romper
 * las ñ y las tildes.
 */
export function decodeCsv(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

/**
 * CSV (RFC 4180) a registros de celdas. Soporta comillas, comillas escapadas (""), delimitador
 * dentro de comillas, saltos de línea dentro de comillas, CRLF/LF y BOM. El delimitador es `;`
 * si la primera línea lo tiene y no tiene `,` (Excel en es-PE a veces guarda con `;`).
 * Devuelve TODOS los registros (los vacíos también) para conservar la numeración de filas.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] ?? ''
  const delimiter = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ','

  const records: string[][] = []
  let record: string[] = []
  let cell = ''
  let inQuotes = false
  let touched = false // hay algo pendiente en el registro actual

  const endCell = () => {
    record.push(cell)
    cell = ''
  }
  const endRecord = () => {
    endCell()
    records.push(record)
    record = []
    touched = false
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cell += ch
      }
      continue
    }
    if (ch === '"') {
      inQuotes = true
      touched = true
    } else if (ch === delimiter) {
      endCell()
      touched = true
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      endRecord()
    } else {
      cell += ch
      touched = true
    }
  }
  if (touched || cell !== '') endRecord()
  return records
}

/** Texto de una celda de Excel sin artefactos de float ni notación científica. */
export function cellToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString()
  if (typeof value === 'number') return numberToString(value)
  return String(value).trim()
}

/**
 * Número de celda -> texto. Excel guarda los decimales como double: 3.1 puede llegar como
 * 3.1000000000000004. Si el valor, redondeado a 2 decimales, difiere en menos de 1e-6 (ruido de
 * float, no un dato real) se emite con aritmética ENTERA ("3.10"); si de verdad tiene más de 2
 * decimales se emite tal cual para que la validación lo rechace. Los enteros se emiten sin
 * notación científica (códigos de barras largos).
 */
export function numberToString(n: number): string {
  if (!Number.isFinite(n)) return String(n)
  if (Number.isInteger(n))
    return Math.abs(n) <= Number.MAX_SAFE_INTEGER ? BigInt(n).toString() : String(n)
  const cents = Math.round(n * 100)
  if (n > 0 && Math.abs(n * 100 - cents) < 1e-6) {
    return `${Math.trunc(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
  }
  return String(n)
}

/**
 * Filas de una hoja (CSV ya partido o salida de read-excel-file) -> filas crudas. La primera
 * fila con algo es el encabezado; las columnas se reconocen por nombre, en cualquier orden, y las
 * desconocidas se ignoran. Las filas totalmente vacías se saltan (la numeración las cuenta).
 */
export function rowsFromSheet(sheet: unknown[][]): ParseResult {
  const table = sheet.map((r) => r.map(cellToString))
  const headerIndex = table.findIndex((r) => r.some((c) => c !== ''))
  if (headerIndex === -1) return { ok: false, error: 'El archivo está vacío' }

  const columns = new Map<ImportField, number>()
  for (const [i, title] of table[headerIndex].entries()) {
    const field = HEADER_ALIASES[headerKey(title)]
    if (field && !columns.has(field)) columns.set(field, i)
  }
  const missing = (['name', 'price'] as const).filter((f) => !columns.has(f))
  if (missing.length > 0) {
    const names = missing.map((f) => `«${FIELD_LABELS[f]}»`).join(' y ')
    return {
      ok: false,
      error: `Falta la columna ${names}. Descarga la plantilla para ver el formato.`,
    }
  }

  const rows: RawImportRow[] = []
  for (let i = headerIndex + 1; i < table.length; i++) {
    const cells = table[i]
    if (cells.every((c) => c === '')) continue
    const get = (f: ImportField) => {
      const col = columns.get(f)
      return col === undefined ? '' : (cells[col] ?? '')
    }
    rows.push({
      line: i + 1,
      name: get('name'),
      price: get('price'),
      category: get('category'),
      barcode: get('barcode'),
      stock: get('stock'),
      minStock: get('minStock'),
      tracksStock: get('tracksStock'),
    })
    if (rows.length > IMPORT_MAX_ROWS) {
      return {
        ok: false,
        error: `El archivo tiene más de ${IMPORT_MAX_ROWS} productos. Divídelo en varios archivos.`,
      }
    }
  }
  if (rows.length === 0) return { ok: false, error: 'El archivo no tiene productos' }
  return { ok: true, rows }
}

/** Atajo para CSV: texto -> filas crudas. */
export function parseCsvFile(text: string): ParseResult {
  return rowsFromSheet(parseCsv(text))
}
