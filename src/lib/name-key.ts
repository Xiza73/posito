// Nombres de categorías y productos: "Hogar", "hogar" y " HOGAR " son el mismo nombre, y
// "Lácteos" = "Lacteos". La `ñ` es otra letra: "Año" ≠ "Ano". La clave de comparación
// (`name_key`) se guarda en la DB con un índice único por bodega; SIEMPRE se escribe con
// estos helpers (nunca a mano). La migración 0004 replica `nameKey` en SQL solo para el
// backfill de filas existentes (ver drizzle/0004_names_backfill.sql).

/** Lo que se guarda en `name`: NFC, sin espacios en los extremos y con espacios internos colapsados. */
export function normalizeDisplayName(s: string): string {
  return s.normalize('NFC').trim().replace(/\s+/g, ' ')
}

const KEEP_N_TILDE_OR_MARK = /ñ|[̀-ͯ]/g

/** Clave de comparación: display normalizado + minúsculas (es-PE) + sin tildes/diéresis, salvo la ñ. */
export function nameKey(s: string): string {
  return normalizeDisplayName(s)
    .toLocaleLowerCase('es-PE')
    .normalize('NFD')
    .replace(KEEP_N_TILDE_OR_MARK, (m) => (m === 'ñ' ? m : ''))
    .normalize('NFC')
}
