export const INPUT = 'h-11 w-full rounded-ctl border border-line bg-page px-3 text-ink'

export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5 text-muted text-sm">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span role="alert" className="text-bad text-xs">
          {error}
        </span>
      ) : hint ? (
        <span className="text-xs">{hint}</span>
      ) : null}
    </div>
  )
}
