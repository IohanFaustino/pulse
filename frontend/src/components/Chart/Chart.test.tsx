/**
 * Chart component tests.
 */

import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Chart from './index'

const TWO_POINTS = [
  { date: '2026-01-01', value: 4.5 },
  { date: '2026-02-01', value: 4.8 },
]

const MANY_POINTS = Array.from({ length: 12 }, (_, i) => ({
  date: `2026-${String(i + 1).padStart(2, '0')}-01`,
  value: 4 + i * 0.1,
}))

describe('Chart', () => {
  it('renders chart SVG with data-testid="chart"', () => {
    render(<Chart data={TWO_POINTS} format="line" />)
    expect(screen.getByTestId('chart')).toBeInTheDocument()
  })

  it('renders line format', () => {
    render(<Chart data={TWO_POINTS} format="line" />)
    expect(screen.getByTestId('chart')).toHaveAttribute('data-format', 'line')
    expect(screen.getByTestId('chart-line')).toBeInTheDocument()
  })

  it('renders bar format', () => {
    render(<Chart data={TWO_POINTS} format="bar" />)
    expect(screen.getByTestId('chart')).toHaveAttribute('data-format', 'bar')
    expect(screen.getByTestId('chart-bars')).toBeInTheDocument()
  })

  it('renders area format', () => {
    render(<Chart data={TWO_POINTS} format="area" />)
    expect(screen.getByTestId('chart')).toHaveAttribute('data-format', 'area')
    expect(screen.getByTestId('chart-area')).toBeInTheDocument()
    expect(screen.getByTestId('chart-line')).toBeInTheDocument()
  })

  it('renders terminal dot for line format', () => {
    render(<Chart data={TWO_POINTS} format="line" />)
    expect(screen.getByTestId('chart-dot')).toBeInTheDocument()
  })

  it('renders terminal dot for area format', () => {
    render(<Chart data={TWO_POINTS} format="area" />)
    expect(screen.getByTestId('chart-dot')).toBeInTheDocument()
  })

  it('does not render a line in bar format', () => {
    render(<Chart data={TWO_POINTS} format="bar" />)
    expect(screen.queryByTestId('chart-line')).not.toBeInTheDocument()
  })

  it('renders no-data placeholder for insufficient data', () => {
    render(<Chart data={[]} format="line" />)
    expect(screen.getByTestId('chart')).toBeInTheDocument()
    expect(screen.queryByTestId('chart-line')).not.toBeInTheDocument()
  })

  it('renders no-data placeholder for single point', () => {
    render(<Chart data={[{ date: '2026-01-01', value: 5 }]} format="line" />)
    expect(screen.queryByTestId('chart-line')).not.toBeInTheDocument()
  })

  it('renders all bar rects for bar format', () => {
    render(<Chart data={MANY_POINTS} format="bar" />)
    const barsGroup = screen.getByTestId('chart-bars')
    const rects = barsGroup.querySelectorAll('rect')
    expect(rects.length).toBe(MANY_POINTS.length)
  })

  it('accepts custom width and height', () => {
    render(<Chart data={TWO_POINTS} format="line" width={400} height={200} />)
    const svg = screen.getByTestId('chart')
    expect(svg).toHaveAttribute('width', '400')
    expect(svg).toHaveAttribute('height', '200')
  })
})
