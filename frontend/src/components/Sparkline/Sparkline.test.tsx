import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Sparkline from './index'

describe('Sparkline', () => {
  it('renders an SVG element', () => {
    render(<Sparkline values={[1, 2, 3]} />)
    expect(screen.getByTestId('sparkline')).toBeInTheDocument()
  })

  it('renders no polyline for empty data', () => {
    render(<Sparkline values={[]} />)
    expect(screen.queryByTestId('sparkline-polyline')).not.toBeInTheDocument()
  })

  it('renders no polyline for single data point', () => {
    render(<Sparkline values={[42]} />)
    expect(screen.queryByTestId('sparkline-polyline')).not.toBeInTheDocument()
  })

  it('renders a polyline for 2+ data points', () => {
    render(<Sparkline values={[1, 2]} />)
    expect(screen.getByTestId('sparkline-polyline')).toBeInTheDocument()
  })

  it('renders a polyline and terminal dot for N values', () => {
    const values = Array.from({ length: 24 }, (_, i) => i * 0.5)
    render(<Sparkline values={values} />)
    expect(screen.getByTestId('sparkline-polyline')).toBeInTheDocument()
    expect(screen.getByTestId('sparkline-dot')).toBeInTheDocument()
  })

  it('skips null values without crashing', () => {
    render(<Sparkline values={[1, null, 3, null, 5]} />)
    expect(screen.getByTestId('sparkline-polyline')).toBeInTheDocument()
  })

  it('applies data-variant attribute', () => {
    render(<Sparkline values={[1, 2, 3]} variant="up" />)
    expect(screen.getByTestId('sparkline')).toHaveAttribute('data-variant', 'up')
  })

  it('uses provided width and height', () => {
    render(<Sparkline values={[1, 2, 3]} width={100} height={40} />)
    const svg = screen.getByTestId('sparkline')
    expect(svg).toHaveAttribute('width', '100')
    expect(svg).toHaveAttribute('height', '40')
  })
})
