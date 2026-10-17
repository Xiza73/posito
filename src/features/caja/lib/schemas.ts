import { z } from 'zod'
import { PAYMENT_METHODS } from '@/lib/payment'

export const MAX_QTY = 999

/** Lo único que el cliente decide: qué productos, cuántos y cómo paga. Los precios los calcula el servidor. */
export const checkoutInputSchema = z.object({
  saleId: z.uuid(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  /** Opcional: sin cliente = público general. El servidor verifica bodega y estado activo. */
  customerId: z.uuid().nullish(),
  /** Total que ve el cajero: solo un guard contra precios desactualizados, nunca un precio. */
  expectedTotalCents: z.int().min(0).max(2_147_483_647),
  items: z
    .array(z.object({ productId: z.uuid(), quantity: z.int().min(1).max(MAX_QTY) }))
    .min(1)
    .max(100),
})

export type CheckoutInput = z.infer<typeof checkoutInputSchema>
