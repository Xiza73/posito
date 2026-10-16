/** Esqueleto del contenido: el shell (sidebar/header) vive en el layout y no se reemplaza. */
export default function Loading() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4 p-4 md:px-7 md:py-6">
      <span className="sr-only">Cargando…</span>
      <div className="h-6 w-40 animate-pulse rounded-card bg-surface-2" />
      <div className="h-11 w-full max-w-md animate-pulse rounded-card bg-surface-2" />
      <div className="h-24 animate-pulse rounded-card bg-surface-2" />
      <div className="h-24 animate-pulse rounded-card bg-surface-2" />
      <div className="h-24 animate-pulse rounded-card bg-surface-2" />
    </div>
  )
}
