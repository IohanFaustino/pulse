/**
 * Chart — inline SVG chart with animated entrance.
 *
 * Supports three formats:
 *   - line  : polyline, drawn via stroke-dashoffset animation
 *   - bar   : rect bars, animated scale-y from 0 per bar with stagger
 *   - area  : filled path below line, fade-in opacity
 *
 * Animation is skipped when prefers-reduced-motion: reduce is set.
 * No external chart library — pure SVG.
 */

import { useRef, useEffect, useId, forwardRef, useImperativeHandle } from 'react'
import styles from './Chart.module.css'

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
  className?: string
}

export interface ChartHandle {
  svgElement: SVGSVGElement | null
}

const PAD_X = 8
const PAD_Y = 12
const AXIS_H = 20 // height reserved for date axis labels

function useReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const Chart = forwardRef<ChartHandle, ChartProps>(function Chart({
  data,
  format,
  width = 600,
  height = 280,
  className,
}, ref) {
  const svgRef = useRef<SVGSVGElement>(null)

  useImperativeHandle(ref, () => ({
    get svgElement() { return svgRef.current },
  }))
  const lineRef = useRef<SVGPolylineElement | null>(null)
  const areaRef = useRef<SVGPathElement | null>(null)
  const barsRef = useRef<SVGGElement | null>(null)
  const clipId = useId().replace(/:/g, '')
  const reducedMotion = useReducedMotion()

  const innerH = height - PAD_Y * 2 - AXIS_H
  const innerW = width - PAD_X * 2

  // Filter valid points
  const valid = data.filter((d) => isFinite(d.value))

  if (valid.length < 2) {
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

  const values = valid.map((d) => d.value)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal || 1
  const padding5pct = range * 0.05
  const yMin = minVal - padding5pct
  const yMax = maxVal + padding5pct
  const yRange = yMax - yMin

  const n = valid.length

  function xOf(i: number): number {
    return PAD_X + (i / (n - 1)) * innerW
  }

  function yOf(v: number): number {
    return PAD_Y + innerH - ((v - yMin) / yRange) * innerH
  }

  // Compute points string for polyline
  const pointsStr = valid
    .map((d, i) => `${xOf(i).toFixed(1)},${yOf(d.value).toFixed(1)}`)
    .join(' ')

  // Compute area path
  const areaPath = (() => {
    const pts = valid.map((d, i) => `${xOf(i).toFixed(1)},${yOf(d.value).toFixed(1)}`)
    const baseY = (PAD_Y + innerH).toFixed(1)
    return `M${xOf(0).toFixed(1)},${baseY} L${pts.join(' L')} L${xOf(n - 1).toFixed(1)},${baseY} Z`
  })()

  // Date axis ticks: start, mid, end
  const tickIndices = [0, Math.floor((n - 1) / 2), n - 1]
  const axisY = PAD_Y + innerH + AXIS_H - 4

  // Animation on mount
  useEffect(() => {
    if (reducedMotion) return

    const duration = 600 // ms

    if (format === 'line' && lineRef.current) {
      const el = lineRef.current
      const len = el.getTotalLength?.() ?? 1000
      el.style.strokeDasharray = `${len}`
      el.style.strokeDashoffset = `${len}`
      el.style.transition = 'none'
      // Force reflow
      void el.getBoundingClientRect()
      el.style.transition = `stroke-dashoffset ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`
      el.style.strokeDashoffset = '0'
    }

    if (format === 'area' && areaRef.current) {
      const el = areaRef.current
      el.style.opacity = '0'
      void el.getBoundingClientRect()
      el.style.transition = `opacity ${duration}ms ease`
      el.style.opacity = '0.18'
    }

    if (format === 'bar' && barsRef.current) {
      const bars = barsRef.current.querySelectorAll<SVGRectElement>('[data-bar]')
      bars.forEach((bar, i) => {
        bar.style.transformOrigin = `0 ${(PAD_Y + innerH).toFixed(1)}px`
        bar.style.transform = 'scaleY(0)'
        bar.style.transition = 'none'
        void bar.getBoundingClientRect()
        bar.style.transition = `transform ${duration}ms cubic-bezier(0.4, 0, 0.2, 1) ${i * 20}ms`
        bar.style.transform = 'scaleY(1)'
      })
    }
  }, [format, reducedMotion, innerH])

  const barW = Math.max(2, Math.min(20, innerW / n - 2))

  return (
    <svg
      ref={svgRef}
      className={[styles.chart, className].filter(Boolean).join(' ')}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label="Gráfico de série temporal"
      data-testid="chart"
      data-format={format}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={PAD_X} y={PAD_Y} width={innerW} height={innerH} />
        </clipPath>
      </defs>

      {/* Grid lines (3 horizontal) */}
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
          style={reducedMotion ? { opacity: 0.18 } : { opacity: 0 }}
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
                style={reducedMotion ? {} : { transformOrigin: `0 ${(PAD_Y + innerH).toFixed(1)}px`, transform: 'scaleY(0)' }}
              />
            )
          })}
        </g>
      )}

      {/* Terminal dot for line/area */}
      {(format === 'line' || format === 'area') && valid.length > 0 && (
        <circle
          cx={xOf(n - 1)}
          cy={yOf(valid[n - 1].value)}
          r={3}
          className={styles.dot}
          data-testid="chart-dot"
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
    </svg>
  )
})

export default Chart
