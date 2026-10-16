// Utilidades CSV compartidas (Ventas e Inventario exportan). Las features no se importan entre sí,
// por eso lo genérico vive aquí.

const BOM = '﻿'

/** Céntimos enteros -> "9.10", con aritmética entera (sin floats). */
export function centsToDecimal(cents: number): string {
  const abs = Math.abs(cents)
  const sign = cents < 0 ? '-' : ''
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/**
 * Inyección de fórmulas (CSV injection): Excel/Sheets ejecutan como fórmula una celda que empieza
 * con = + - @ (o tab / retorno de carro). Se antepone `'` para que se lea como texto.
 * Aplica a TODO texto que venga de usuarios (nombres de producto, cajero, motivo).
 */
const FORMULA_START = /^[=+\-@\t\r]/

/** RFC 4180: se entrecomilla si hay coma, comilla o salto de línea; las comillas se duplican. */
export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

/** CSV UTF-8 con BOM (Excel lo abre con tildes), separador coma y saltos CRLF. */
export function buildCsv(lines: readonly (readonly string[])[]): string {
  return `${BOM}${lines.map((cells) => cells.map(csvCell).join(',')).join('\r\n')}\r\n`
}
