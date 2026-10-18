// Etiqueta del Data Cache de la tienda pública, UNA POR BODEGA. Aparte de store-cache.ts para que
// la lectura (features/tienda/data/cached.ts) no arrastre la sesión.
export const storeTag = (orgId: string) => `tienda:${orgId}`
