/**
 * Delta direction semantics per category.
 *
 * Financial semantics: "up" does not always mean "melhora" (improvement).
 * For example, higher unemployment (Trabalho) is piora even though the delta is positive.
 *
 * Rule table: categories where a positive delta = piora (deterioration).
 */

export type DeltaDirection = 'up' | 'down' | 'neutral'

/**
 * Categories where an increase in value means DETERIORATION (piora).
 * All other categories: increase = melhora.
 */
const INVERTED_CATEGORIES: ReadonlySet<string> = new Set([
  'Trabalho',   // unemployment rate — higher = worse
  'Inflação',   // inflation — higher = worse
  'Fiscal',     // primary deficit — higher deficit = worse
])

/**
 * Determine whether a delta represents improvement or deterioration
 * given the series category.
 *
 * @param category  pt-BR category name (e.g. 'Inflação', 'Juros')
 * @param delta     numeric delta value (current - previous)
 * @returns 'up' | 'down' | 'neutral'
 */
export function getDeltaDirection(category: string, delta: number): DeltaDirection {
  if (delta === 0 || !isFinite(delta)) return 'neutral'

  const positiveIsPiora = INVERTED_CATEGORIES.has(category)
  const deltaIsPositive = delta > 0

  if (positiveIsPiora) {
    // positive delta = piora = down (red)
    return deltaIsPositive ? 'down' : 'up'
  } else {
    // positive delta = melhora = up (green)
    return deltaIsPositive ? 'up' : 'down'
  }
}

/**
 * Compute delta between two values and classify direction.
 */
export function computeDelta(
  current: number,
  previous: number,
  category: string,
): { delta: number; direction: DeltaDirection } {
  const delta = current - previous
  return { delta, direction: getDeltaDirection(category, delta) }
}
