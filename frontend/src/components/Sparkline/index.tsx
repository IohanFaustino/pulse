/**
 * Sparkline — inline SVG miniature line chart with optional hover tooltip.
 *
 * - Pure SVG, no chart library.
 * - When `dates` is provided, hovering the chart shows a vertical guide,
 *   highlights the nearest data point, and renders a floating tooltip with
 *   the formatted date + value (Plotly-style).
 * - Touch: tooltip follows touchmove for mobile scrub.
 */

import { useRef, useState, useMemo } from 'react'
import styles from './Sparkline.module.css'
import { formatNumber, formatDate } from '@/lib/formatPtBR'

interface SparklineProps {
  /** Array of numeric values (NaN / null entries are skipped). */
  values: (number | null)[]
  /** ISO date strings aligned 1:1 to `values` — required for hover tooltip. */
  dates?: string[]
  width?: number
  height?: number
  /** Semantic colour variant. Defaults to 'default' (accent-2 blue). */
  variant?: 'up' | 'down' | 'neutral' | 'default'
  /** Explicit stroke/fill colour. Overrides `variant` when set. */
  color?: string
  /** Optional unit suffix shown in tooltip (e.g. "%", "R$ mi"). */
  unit?: string
  className?: string
}

export default function Sparkline({
  values,
  dates,
  width = 200,
  height = 56,
  variant = 'default',
  color,
  unit,
  className,
}: SparklineProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  // Filter out null/NaN to get valid points with their original indices
  const validPoints = useMemo(() => {
    const pts: Array<{ idx: number; val: number }> = []
    values.forEach((v, i) => {
      if (v !== null && v !== undefined && isFinite(v)) {
        pts.push({ idx: i, val: v })
      }
    })
    return pts
  }, [values])

  if (validPoints.length < 2) {
    return (
      <svg
        className={[styles.sparkline, className].filter(Boolean).join(' ')}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        data-testid="sparkline"
        data-variant={variant}
      />
    )
  }

  const n = values.length
  const allVals = validPoints.map((p) => p.val)
  const minVal = Math.min(...allVals)
  const maxVal = Math.max(...allVals)
  const range = maxVal - minVal || 1

  const pad = 4 // px padding so stroke doesn't clip at edges (peak/trough room)

  function xScale(idx: number): number {
    return pad + ((idx / (n - 1)) * (width - 2 * pad))
  }

  function yScale(val: number): number {
    return height - pad - ((val - minVal) / range) * (height - 2 * pad)
  }

  const points = validPoints
    .map((p) => `${xScale(p.idx).toFixed(1)},${yScale(p.val).toFixed(1)}`)
    .join(' ')

  const last = validPoints[validPoints.length - 1]
  const lastX = xScale(last?.idx ?? 0)
  const lastY = yScale(last?.val ?? 0)

  const interactive = Boolean(dates && dates.length === values.length)

  function handlePointer(clientX: number) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    // Map clientX → svg viewBox x coordinate
    const ratio = (clientX - rect.left) / rect.width
    const xInSvg = ratio * width
    // Find the validPoint with the closest xScale to xInSvg
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < validPoints.length; i++) {
      const d = Math.abs(xScale(validPoints[i].idx) - xInSvg)
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    setHoverIdx(bestIdx)
  }

  function handleLeave() {
    setHoverIdx(null)
  }

  // Resolve hovered point + screen-relative position for the tooltip
  const hovered = hoverIdx !== null ? validPoints[hoverIdx] : null
  const hoverX = hovered ? xScale(hovered.idx) : 0
  const hoverY = hovered ? yScale(hovered.val) : 0
  const hoverDate = hovered && dates ? dates[hovered.idx] : null

  // Tooltip placement — flip to the left if it would overflow on the right
  const tooltipLeftPct = (hoverX / width) * 100
  const flipLeft = tooltipLeftPct > 65

  return (
    <div
      ref={wrapperRef}
      className={styles.wrapper}
      data-testid="sparkline-wrapper"
    >
      <svg
        ref={svgRef}
        className={[styles.sparkline, className].filter(Boolean).join(' ')}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden={!interactive}
        data-testid="sparkline"
        data-variant={variant}
        onMouseMove={interactive ? (e) => handlePointer(e.clientX) : undefined}
        onMouseLeave={interactive ? handleLeave : undefined}
        onTouchMove={interactive ? (e) => handlePointer(e.touches[0].clientX) : undefined}
        onTouchEnd={interactive ? handleLeave : undefined}
        style={interactive ? { cursor: 'crosshair' } : undefined}
      >
        <polyline
          className={styles.line}
          points={points}
          style={color ? { stroke: color } : undefined}
          data-testid="sparkline-polyline"
        />
        <circle
          className={styles.dot}
          cx={lastX}
          cy={lastY}
          r={2.5}
          style={color ? { fill: color } : undefined}
          data-testid="sparkline-dot"
        />
        {hovered && (
          <>
            {/* Vertical guide line */}
            <line
              className={styles.guide}
              x1={hoverX}
              x2={hoverX}
              y1={pad}
              y2={height - pad}
            />
            {/* Highlighted hover dot */}
            <circle
              className={styles.hoverDot}
              cx={hoverX}
              cy={hoverY}
              r={3.5}
              style={color ? { stroke: color } : undefined}
            />
          </>
        )}
      </svg>

      {hovered && hoverDate && (
        <div
          className={styles.tooltip}
          style={{
            left: flipLeft ? undefined : `${tooltipLeftPct}%`,
            right: flipLeft ? `${100 - tooltipLeftPct}%` : undefined,
          }}
          role="status"
          aria-live="polite"
          data-testid="sparkline-tooltip"
        >
          <span className={styles.tooltipDate}>{formatDate(hoverDate)}</span>
          <span className={styles.tooltipValue}>
            {formatNumber(hovered.val)}
            {unit && <span className={styles.tooltipUnit}> {unit}</span>}
          </span>
        </div>
      )}
    </div>
  )
}
