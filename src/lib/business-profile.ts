import { z } from 'zod'

// Datos del negocio que salen en la boleta. Módulo puro (sin servidor): lo usan la DB (lib/settings),
// el cobro (snapshot) y la boleta (cliente).

export const DEFAULT_RECEIPT_FOOTER = 'Gracias por su compra'

/** Perfil vigente de la bodega, ya con valores por defecto resueltos. */
export type BusinessProfile = {
  tradeName: string
  legalName: string | null
  ruc: string | null
  address: string | null
  phone: string | null
  branchName: string | null
  receiptFooter: string
}

/** Copia congelada del perfil en `sale.business_snapshot` (versionada por si el formato cambia). */
export type BusinessSnapshot = BusinessProfile & { version: 1 }

const nullableText = z.string().nullable()

/** Se valida AL LEER: un jsonb inválido o de otra versión cae al perfil vigente. */
export const businessSnapshotSchema = z.object({
  version: z.literal(1),
  tradeName: z.string().min(1),
  legalName: nullableText,
  ruc: nullableText,
  address: nullableText,
  phone: nullableText,
  branchName: nullableText,
  receiptFooter: z.string(),
})

export function toSnapshot(profile: BusinessProfile): BusinessSnapshot {
  return { version: 1, ...profile }
}

/** Snapshot válido o null (ventas antiguas o jsonb dañado): el llamador cae al perfil vigente. */
export function parseSnapshot(raw: unknown): BusinessSnapshot | null {
  const parsed = businessSnapshotSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}
