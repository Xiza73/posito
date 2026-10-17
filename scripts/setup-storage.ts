// Crea o actualiza el bucket de fotos de producto en Supabase Storage. Idempotente.
// Uso: bun run storage:setup   (Bun carga .env.local: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY)
// Nunca imprime la clave.
import { IMAGE_BUCKET, IMAGE_CONTENT_TYPE, IMAGE_MAX_BYTES } from '@/lib/product-image'
import { StorageConfigError, StorageError, storageFromEnv } from '@/lib/storage'

try {
  const result = await storageFromEnv(process.env).ensureBucket(IMAGE_BUCKET, {
    public: true,
    fileSizeLimit: IMAGE_MAX_BYTES,
    allowedMimeTypes: [IMAGE_CONTENT_TYPE],
  })
  console.log(
    `Bucket "${IMAGE_BUCKET}" ${result === 'created' ? 'creado' : 'actualizado'} (público, máx. 1 MB, solo ${IMAGE_CONTENT_TYPE}).`,
  )
} catch (e) {
  if (e instanceof StorageConfigError || e instanceof StorageError) {
    console.error(e.message)
  } else {
    console.error('Error inesperado al configurar el bucket')
  }
  process.exit(1)
}
