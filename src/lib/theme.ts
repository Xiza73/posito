export const THEMES = ['cielo', 'cafe'] as const
export type Theme = (typeof THEMES)[number]

export const THEME_COOKIE = 'theme'
export const DEFAULT_THEME: Theme = 'cielo'

export function parseTheme(value: string | undefined): Theme {
  return THEMES.find((t) => t === value) ?? DEFAULT_THEME
}
