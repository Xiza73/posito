import { CATEGORIES, type Category } from '../data/products.mock'

type Props = {
  value: Category
  onChange: (category: Category) => void
}

export function CategoryChips({ value, onChange }: Props) {
  return (
    <fieldset
      aria-label="Categorías"
      className="flex min-w-0 flex-none gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]"
    >
      {CATEGORIES.map((c) => {
        const on = c === value
        return (
          <button
            key={c}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(c)}
            className={`h-9 flex-none cursor-pointer whitespace-nowrap rounded-full border px-3.5 text-[13px] ${
              on
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-line bg-surface text-ink hover:border-accent'
            }`}
          >
            {c}
          </button>
        )
      })}
    </fieldset>
  )
}
