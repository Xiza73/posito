export function NoPermission({ title }: { title: string }) {
  return (
    <div className="animate-fade-up p-4 md:px-7 md:py-6">
      <div className="rounded-card border border-line bg-surface p-8 text-center">
        <h2 className="font-semibold text-lg">{title}</h2>
        <p className="mt-2 text-muted text-sm">No tienes permiso para ver esta sección.</p>
      </div>
    </div>
  )
}
