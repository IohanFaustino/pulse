/**
 * LoadingSkeleton — shimmer skeleton primitives.
 *
 * Provides composable skeleton components:
 *   - SkeletonRect   — a rectangular shimmering block
 *   - SkeletonCircle — a circular shimmering block
 *   - SkeletonCard   — a full card skeleton with title + lines + sparkline area
 *   - SkeletonGrid   — a grid of N card skeletons
 */

import styles from './LoadingSkeleton.module.css'

// ── Primitives ────────────────────────────────────────────────────────────────

interface RectProps {
  width?: string | number
  height?: string | number
  className?: string
}

export function SkeletonRect({ width = '100%', height = '1rem', className }: RectProps) {
  return (
    <span
      className={[styles.base, styles.rect, className].filter(Boolean).join(' ')}
      style={{ width, height }}
      data-testid="skeleton-rect"
      aria-hidden="true"
    />
  )
}

interface CircleProps {
  size?: string | number
  className?: string
}

export function SkeletonCircle({ size = '2rem', className }: CircleProps) {
  return (
    <span
      className={[styles.base, styles.circle, className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      data-testid="skeleton-circle"
      aria-hidden="true"
    />
  )
}

// ── Card skeleton ─────────────────────────────────────────────────────────────

export function SkeletonCard() {
  return (
    <div className={styles.card} data-testid="skeleton-card" aria-busy="true">
      {/* Code + source row */}
      <SkeletonRect width="35%" height="0.875rem" />
      {/* Value hero */}
      <SkeletonRect width="55%" height="1.5rem" />
      {/* Delta row */}
      <SkeletonRect width="25%" height="0.75rem" />
      {/* Sparkline area */}
      <SkeletonRect width="100%" height="28px" />
      {/* Source meta */}
      <SkeletonRect width="70%" height="0.625rem" />
    </div>
  )
}

// ── Grid skeleton ─────────────────────────────────────────────────────────────

interface GridProps {
  count?: number
}

export function SkeletonGrid({ count = 6 }: GridProps) {
  return (
    <div className={styles.grid} data-testid="skeleton-grid" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

// ── Default export — named compound ──────────────────────────────────────────

const LoadingSkeleton = {
  Rect: SkeletonRect,
  Circle: SkeletonCircle,
  Card: SkeletonCard,
  Grid: SkeletonGrid,
}

export default LoadingSkeleton
