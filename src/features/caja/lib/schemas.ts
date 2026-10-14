import { z } from 'zod'
import { PAYMENT_METHODS } from './payment'

export const MAX_QTY = 999

/** Lo único que el cliente decide: qué productos, cuántos y cómo paga. Los precios los calcula el servidor. */
export const checkoutInputSchema = z.object({
  saleId: z.uuid(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  items: z
    .array(z.object({ productId: z.uuid(), quantity: z.int().min(1).max(MAX_QTY) }))
    .min(1)
    .max(100),
})

export type CheckoutInput = z.infer<typeof checkoutInputSchema>
