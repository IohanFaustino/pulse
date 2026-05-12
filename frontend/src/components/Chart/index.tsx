/**
 * Chart — inline SVG chart with animated entrance + Plotly-style hover tooltip.
 *
 * Supports three formats:
 *   - line  : polyline, drawn via stroke-dashoffset animation
 *   - bar   : rect bars, animated scale-y from 0 per bar with stagger
 *   - area  : filled path below line, fade-in opacity
 *
 * Hover (mouse + touch): vertical guide line, highlighted point/bar,
 * floating tooltip with date + value (+ optional unit).
 *
 * Animation skipped when prefers-reduced-motion: reduce is set.
 * No external chart library — pure SVG.
 */

import { useRef, useEffect, useId, useState, useMemo, forwardRef, useImperativeHandle } from 'react'
import styles from './Chart.module.css'
import { formatNumber, formatDate } from '@/lib/formatPtBR'

export type ChartFormat = 'line' | 'bar' | 'area'

export interface ChartDataPoint {
  date: string
  value: number
}

interface ChartProps {
  data: ChartDataPoint[]
  format: ChartFormat
  width?: number
  height?: number
  /** Optional unit suffix shown in the tooltip (e.g. "%", "R$ mi"). */
  unit?: string
  /** Optional explicit colour for the line/bar/dot — overrides CSS variant. */
  color?: string
  className?: string
}

export interface ChartHandle {
  svgElement: SVGSVGElement | null
}

const PAD_X = 8
const PAD_Y = 12
const AXIS_H = 20

function useReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const Chart = forwardRef<ChartHandle, ChartProps>(function Chart({
  data,
  format,
  width = 600,
  height = 280,
  unit,
  color,
  className,
}, ref) {
  const svgRef = useRef<SVGSVGElement>(null)

  useImperativeHandle(ref, () => ({
    get svgElement() { return svgRef.current },
  }))
  const lineRef = useRef<SVGPolylineElement | null>(null)
  const areaRef = useRef<SVGPathElement | null>(null)
  const barsRef = useRef<SVGGElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const clipId = useId().replace(/:/g, '')
  const reducedMotion = useReducedMotion()
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const innerH = height - PAD_Y * 2 - AXIS_H
  const innerW = width - PAD_X * 2

  // Filter valid points
  const valid = useMemo(() => data.filter((d) => isFinite(d.value)), [data])
  const n = valid.length

  // Pre-compute scales (must run before early-return so hooks count is stable)
  const { yMin, yRange, xOf, yOf } = useMemo(() => {
    if (n < 2) {
      return {
        yMin: 0,
        yRange: 1,
        xOf: (_: number) => 0,
        yOf: (_: number) => 0,
      }
    }
    const values = valid.map((d) => d.value)
    const minVal = Math.min(...values)
    const maxVal = Math.max(...values)
    const range = maxVal - minVal || 1
    const padding5pct = range * 0.05
    const yMin = minVal - padding5pct
    const yMax = maxVal + padding5pct
    const yRange = yMax - yMin
    return {
      yMin,
      yRange,
      xOf: (i: number) => PAD_X + (i / (n - 1)) * innerW,
      yOf: (v: number) => PAD_Y + innerH - ((v - yMin) / yRange) * innerH,
    }
  }, [valid, n, innerW, innerH])

  // Animation on mount — fast spring-friendly durations
  useEffect(() => {
    if (reducedMotion || n < 2) return

    const lineDuration = 320 // ms — line / area
    const barDuration = 260 // ms — per-bar scale
    const barStagger = 8 // ms — per-bar delay

    if (format === 'line' && lineRef.current) {
      const el = lineRef.current
      const len = el.getTotalLength?.() ?? 1000
      el.style.strokeDasharray = `${len}`
      el.style.strokeDashoffset = `${len}`
      el.style.transition = 'none'
      void el.getBoundingClientRect()
      el.style.transition = `stroke-dashoffset ${lineDuration}ms cubic-bezier(0.2, 0.7, 0.2, 1)`
      el.style.strokeDashoffset = '0'
    }

    if (format === 'area' && areaRef.current) {
      const el = areaRef.current
      el.style.opacity = '0'
      void el.getBoundingClientRect()
      el.style.transition = `opacity ${lineDuration}ms ease-out`
      el.style.opacity = '0.18'
    }

    if (format === 'bar' && barsRef.current) {
      const bars = barsRef.current.querySelectorAll<SVGRectElement>('[data-bar]')
      bars.forEach((bar, i) => {
        bar.style.transformOrigin = `0 ${(PAD_Y + innerH).toFixed(1)}px`
        bar.style.transform = 'scaleY(0)'
        bar.style.transition = 'none'
        void bar.getBoundingClientRect()
        bar.style.transition = `transform ${barDuration}ms cubic-bezier(0.2, 0.7, 0.2, 1) ${i * barStagger}ms`
        bar.style.transform = 'scaleY(1)'
      })
    }
  }, [format, reducedMotion, innerH, n])

  if (n < 2) {
    return (
      <svg
        ref={svgRef}
        className={[styles.chart, className].filter(Boolean).join(' ')}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-label="Gráfico sem dados suficientes"
        data-testid="chart"
        data-format={format}
      >
        <text x={width / 2} y={height / 2} textAnchor="middle" className={styles.noData}>
          Sem dados
        </text>
      </svg>
    )
  }

  // Compute geometry
  const pointsStr = valid
    .map((d, i) => `${xOf(i).toFixed(1)},${yOf(d.value).toFixed(1)}`)
    .join(' ')

  const areaPath = (() => {
    const pts = valid.map((d, i) => `${xOf(i).toFixed(1)},${yOf(d.value).toFixed(1)}`)
    const baseY = (PAD_Y + innerH).toFixed(1)
    return `M${xOf(0).toFixed(1)},${baseY} L${pts.join(' L')} L${xOf(n - 1).toFixed(1)},${baseY} Z`
  })()

  const tickIndices = [0, Math.floor((n - 1) / 2), n - 1]
  const axisY = PAD_Y + innerH + AXIS_H - 4
  const barW = Math.max(2, Math.min(20, innerW / n - 2))

  // ── Hover tracking — find nearest data index from cursor x ────────────
  function handlePointer(clientX: number) {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const ratio = (clientX - rect.left) / rect.width
    const xInSvg = ratio * width
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < n; i++) {
      const d = Math.abs(xOf(i) - xInSvg)
      if (d < bestDist) {
        bestDist = d
        bestIdx = i
      }
    }
    setHoverIdx(bestIdx)
  }

  const hovered = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < n ? valid[hoverIdx] : null
  const hoverX = hovered ? xOf(hoverIdx!) : 0
  const hoverY = hovered ? yOf(hovered.value) : 0
  const tooltipLeftPct = (hoverX / width) * 100
  const flipLeft = tooltipLeftPct > 65

  return (
    <div
      ref={wrapperRef}
      className={styles.wrapper}
      data-testid="chart-wrapper"
    >
      <svg
        ref={svgRef}
        className={[styles.chart, className].filter(Boolean).join(' ')}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-label="Gráfico de série temporal"
        data-testid="chart"
        data-format={format}
        onMouseMove={(e) => handlePointer(e.clientX)}
        onMouseLeave={() => setHoverIdx(null)}
        onTouchMove={(e) => handlePointer(e.touches[0].clientX)}
        onTouchEnd={() => setHoverIdx(null)}
        style={{ cursor: 'crosshair' }}
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={PAD_X} y={PAD_Y} width={innerW} height={innerH} />
          </clipPath>
        </defs>

        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map((frac) => {
          const gy = PAD_Y + innerH * frac
          return (
            <line
              key={frac}
              x1={PAD_X}
              y1={gy}
              x2={PAD_X + innerW}
              y2={gy}
              className={styles.gridLine}
            />
          )
        })}

        {/* Area fill */}
        {format === 'area' && (
          <path
            ref={areaRef}
            d={areaPath}
            className={styles.area}
            clipPath={`url(#${clipId})`}
            data-testid="chart-area"
            style={{
              opacity: reducedMotion ? 0.18 : 0,
              ...(color ? { fill: color } : {}),
            }}
          />
        )}

        {/* Line */}
        {(format === 'line' || format === 'area') && (
          <polyline
            ref={lineRef}
            points={pointsStr}
            className={styles.line}
            clipPath={`url(#${clipId})`}
            data-testid="chart-line"
            style={color ? { stroke: color } : undefined}
          />
        )}

        {/* Bars */}
        {format === 'bar' && (
          <g ref={barsRef} data-testid="chart-bars">
            {valid.map((d, i) => {
              const x = xOf(i) - barW / 2
              const barH = Math.abs(yOf(d.value) - (PAD_Y + innerH))
              const y = yOf(d.value)
              return (
                <rect
                  key={i}
                  data-bar
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  className={styles.bar}
                  clipPath={`url(#${clipId})`}
                  style={{
                    ...(reducedMotion
                      ? {}
                      : { transformOrigin: `0 ${(PAD_Y + innerH).toFixed(1)}px`, transform: 'scaleY(0)' }),
                    ...(color ? { fill: color } : {}),
                  }}
                />
              )
            })}
          </g>
        )}

        {/* Terminal dot for line/area */}
        {(format === 'line' || format === 'area') && (
          <circle
            cx={xOf(n - 1)}
            cy={yOf(valid[n - 1].value)}
            r={3}
            className={styles.dot}
            data-testid="chart-dot"
            style={color ? { fill: color } : undefined}
          />
        )}

        {/* Date axis */}
        {tickIndices.map((idx) => (
          <text
            key={idx}
            x={xOf(idx)}
            y={axisY}
            className={styles.axisLabel}
            textAnchor={idx === 0 ? 'start' : idx === n - 1 ? 'end' : 'middle'}
          >
            {valid[idx]?.date?.slice(0, 7) ?? ''}
          </text>
        ))}

        {/* Hover guide + highlighted point */}
        {hovered && (
          <>
            <line
              className={styles.guide}
              x1={hoverX}
              x2={hoverX}
              y1={PAD_Y}
              y2={PAD_Y + innerH}
            />
            <circle
              className={styles.hoverDot}
              cx={hoverX}
              cy={hoverY}
              r={4.5}
              style={color ? { stroke: color } : undefined}
            />
          </>
        )}
      </svg>

      {/* Floating tooltip — positioned in % so it follows the SVG when resized */}
      {hovered && (
        <div
          className={styles.tooltip}
          style={{
            left: flipLeft ? undefined : `${tooltipLeftPct}%`,
            right: flipLeft ? `${100 - tooltipLeftPct}%` : undefined,
            top: '0',
          }}
          role="status"
          aria-live="polite"
          data-testid="chart-tooltip"
        >
          <span className={styles.tooltipDate}>{formatDate(hovered.date)}</span>
          <span className={styles.tooltipValue}>
            {formatNumber(hovered.value)}
            {unit && <span className={styles.tooltipUnit}> {unit}</span>}
          </span>
        </div>
      )}
    </div>
  )
})

export default Chart
