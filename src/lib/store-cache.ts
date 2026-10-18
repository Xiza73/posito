import { revalidateTag } from 'next/cache'
import { getCurrentMember } from '@/lib/session'
import { storeTag } from '@/lib/store-tag'

/**
 * Invalida la tienda de la bodega de la sesión. Se llama desde Server Actions que cambian lo que
 * ve la tienda (productos, stock, ventas, datos del negocio). Nunca debe romper la acción que la
 * llama: si falla, la tienda se actualiza sola por el TTL de 30 s.
 */
export async function revalidateStore(): Promise<void> {
  try {
    const { organization } = await getCurrentMember()
    revalidateTag(storeTag(organization.id))
  } catch (e) {
    if (typeof e === 'object' && e !== null && 'digest' in e) throw e
    console.error('[tienda] no se pudo invalidar el caché', e)
  }
}
