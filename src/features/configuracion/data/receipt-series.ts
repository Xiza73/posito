import { and, eq, max, sql } from 'drizzle-orm'
import { receiptSeries, sale } from '@/db/schema'
import type { Db } from '@/lib/db-types'
import { DEFAULT_RECEIPT_SERIES } from '@/lib/receipt'

export type ReceiptSeriesInfo = { series: string; nextNumber: number }

/** Serie y próximo número de la bodega (B001 / 1 si aún no se ha cobrado ni configurado nada). */
export async function getReceiptSeries(db: Db, orgId: string): Promise<ReceiptSeriesInfo> {
  const [row] = await db
    .select({ series: receiptSeries.series, lastNumber: receiptSeries.lastNumber })
    .from(receiptSeries)
    .where(eq(receiptSeries.organizationId, orgId))
  return row
    ? { series: row.series, nextNumber: row.lastNumber + 1 }
    : { series: DEFAULT_RECEIPT_SERIES, nextNumber: 1 }
}

export type UpdateReceiptSeriesResult = { ok: true } | { ok: false; error: string }

/**
 * Cambia la serie y el siguiente número. Rechaza si el número ya fue emitido en esa serie
 * (chocaría con el índice único de `sale` en el próximo cobro).
 */
export async function updateReceiptSeries(
  db: Db,
  { orgId, series, nextNumber }: { orgId: string; series: string; nextNumber: number },
): Promise<UpdateReceiptSeriesResult> {
  return db.transaction(async (tx) => {
    // Asegura que la fila exista ANTES de bloquearla: si no existe, el FOR UPDATE no bloquea nada y
    // un primer cobro concurrente quedaría pisado (lastNumber = 0 → B001-1 duplicado, caja trabada).
    await tx
      .insert(receiptSeries)
      .values({ organizationId: orgId, series: 'B001', lastNumber: 0 })
      .onConflictDoNothing()
    // Bloquea el contador: un cobro en curso termina antes de que revisemos las ventas
    await tx
      .select({ n: receiptSeries.lastNumber })
      .from(receiptSeries)
      .where(eq(receiptSeries.organizationId, orgId))
      .for('update')

    const [{ highest }] = await tx
      .select({ highest: max(sale.number) })
      .from(sale)
      .where(and(eq(sale.organizationId, orgId), eq(sale.series, series)))

    if (highest !== null && nextNumber <= highest) {
      return {
        ok: false as const,
        error: `Ya existen boletas hasta el número ${highest} en la serie ${series}`,
      }
    }

    await tx
      .insert(receiptSeries)
      .values({ organizationId: orgId, series, lastNumber: nextNumber - 1 })
      .onConflictDoUpdate({
        target: receiptSeries.organizationId,
        set: { series, lastNumber: nextNumber - 1, updatedAt: sql`now()` },
      })
    return { ok: true as const }
  })
}
