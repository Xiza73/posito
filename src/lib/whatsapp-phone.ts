// Celular peruano para wa.me: 9 dígitos que empiezan con 9, con prefijo opcional +51 / 51.
// Se normaliza a `51XXXXXXXXX` (formato internacional sin `+`, el que pide wa.me).

export function normalizeWhatsappNumber(raw: string | null | undefined): string | null {
  if (!raw) return null
  const compact = raw.replace(/[\s().-]/g, '')
  if (!/^\+?\d+$/.test(compact)) return null
  const digits = compact.startsWith('+') ? compact.slice(1) : compact
  const national = digits.length === 11 && digits.startsWith('51') ? digits.slice(2) : digits
  return /^9\d{8}$/.test(national) ? `51${national}` : null
}
