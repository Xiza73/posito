type Props = {
  categories: string[]
  /** null = "Todos". */
  value: string | null
  onChange: (category: string | null) => void
}

export function CategoryChips({ categories, value, onChange }: Props) {
  const chips: { label: string; value: string | null }[] = [
    { label: 'Todos', value: null },
    ...categories.map((c) => ({ label: c, value: c })),
  ]

  return (
    <fieldset
      aria-label="Categorías"
      className="flex min-w-0 flex-none gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]"
    >
      {chips.map((c) => {
        const on = c.value === value
        return (
          <button
            key={c.value ?? '__todos'}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(c.value)}
            className={`h-9 flex-none cursor-pointer whitespace-nowrap rounded-full border px-3.5 text-[13px] ${
              on
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-line bg-surface text-ink hover:border-accent'
            }`}
          >
            {c.label}
          </button>
        )
      })}
    </fieldset>
  )
}
