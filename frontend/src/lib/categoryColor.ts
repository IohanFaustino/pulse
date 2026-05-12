/**
 * Maps a pt-BR series category to theme-aware CSS custom properties.
 *
 * Each category resolves to a `var(--cat-*)` token defined in tokens.css.
 * The light/dark variants are switched automatically via [data-theme].
 *
 * Background tints use `color-mix(in srgb, var(--cat-x) 14%, transparent)`
 * so the same call produces appropriate translucency in both themes.
 */

export type Category =
  | 'Inflação'
  | 'Atividade'
  | 'Trabalho'
  | 'Juros'
  | 'Câmbio'
  | 'Mercado'
  | 'Fiscal'
  | 'Externo'
  | 'Renda Fixa'
  | 'Mercado Internacional'
  | 'Sustentabilidade'
  | 'Governança'
  | string

function categoryToken(category: Category): string {
  switch (category) {
    case 'Inflação':              return '--cat-inflacao'
    case 'Juros':                 return '--cat-juros'
    case 'Câmbio':                return '--cat-cambio'
    case 'Mercado':               return '--cat-mercado'
    case 'Atividade':             return '--cat-atividade'
    case 'Trabalho':              return '--cat-trabalho'
    case 'Fiscal':                return '--cat-fiscal'
    case 'Externo':               return '--cat-externo'
    case 'Renda Fixa':            return '--cat-renda-fixa'
    case 'Mercado Internacional': return '--cat-mercado-intl'
    case 'Sustentabilidade':      return '--cat-sustentabilidade'
    case 'Governança':            return '--cat-governanca'
    default:                      return '--ink'
  }
}

/**
 * Foreground colour for a category. Returns `var(--cat-*)`.
 */
export function categoryColor(category: Category): string {
  return `var(${categoryToken(category)})`
}

/**
 * Background tint for a category — translucent over current surface.
 * Uses CSS color-mix so the same alpha works in light and dark themes.
 */
export function categoryBgColor(category: Category): string {
  const token = categoryToken(category)
  return `color-mix(in srgb, var(${token}) 14%, transparent)`
}
