/**
 * DeltaBadge — displays a formatted delta value with financial semantic color.
 *
 * Color semantics are category-aware:
 *   - "up" (green / var(--up)) = melhora
 *   - "down" (red / var(--down)) = piora
 *   - "neutral" = zero or non-finite
 *
 * Example: for 'Inflação', a positive delta is DOWN (piora = red).
 *          for 'Juros' (interest rates), a positive delta depends on context.
 */

import styles from './DeltaBadge.module.css'
import { getDeltaDirection } from '@/lib/deltaSemantics'
import { formatDelta } from '@/lib/formatPtBR'
import type { DeltaDirection } from '@/lib/deltaSemantics'

interface DeltaBadgeProps {
  /** Numeric delta value (can be positive, negative, or zero). */
  value: number
  /** pt-BR category name — used to determine melhora/piora semantics. */
  category: string
  /** Optional: override the direction (skip auto-computation). */
  direction?: DeltaDirection
  /** Optional unit suffix, e.g. "%" or "p.p." */
  unit?: string
  className?: string
}

const ARROW: Record<DeltaDirection, string> = {
  up: '▲',
  down: '▼',
  neutral: '—',
}

export default function DeltaBadge({
  value,
  category,
  direction: directionProp,
  unit,
  className,
}: DeltaBadgeProps) {
  const direction = directionProp ?? getDeltaDirection(category, value)
  const arrow = ARROW[direction]
  const formatted = formatDelta(value)

  return (
    <span
      className={[styles.badge, styles[direction], className].filter(Boolean).join(' ')}
      data-direction={direction}
      data-testid="delta-badge"
      aria-label={`variação ${formatted}${unit ? ' ' + unit : ''}`}
    >
      <span className={styles.arrow} aria-hidden="true">
        {arrow}
      </span>
      <span className={styles.value}>
        {formatted}
        {unit && <span> {unit}</span>}
      </span>
    </span>
  )
}
