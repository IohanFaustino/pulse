/**
 * Hook: compute delta direction from category + values.
 *
 * Wraps deltaSemantics lib for use in React components.
 */

import { getDeltaDirection, computeDelta } from '@/lib/deltaSemantics'
import type { DeltaDirection } from '@/lib/deltaSemantics'

export type { DeltaDirection }

/**
 * Hook: given a category and a delta value, return the semantic direction.
 * Pure computation — no side effects.
 */
export function useDeltaSemantics(category: string, delta: number): DeltaDirection {
  return getDeltaDirection(category, delta)
}

/**
 * Hook: given a category plus current + previous values,
 * return computed delta and direction.
 */
export function useDeltaFromValues(
  category: string,
  current: number,
  previous: number,
): { delta: number; direction: DeltaDirection } {
  return computeDelta(current, previous, category)
}
