import 'server-only'
import { type Storage, storageFromEnv } from './storage'

// Único punto de la app que lee SUPABASE_SERVICE_ROLE_KEY. `server-only` hace que importarlo desde
// un componente cliente rompa el build. Se lee al usarlo (no al importar): el build no la necesita.
export { StorageConfigError, StorageError } from './storage'

let cached: Storage | undefined

export function getStorage(): Storage {
  cached ??= storageFromEnv(process.env)
  return cached
}
