import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DeltaBadge from './index'

describe('DeltaBadge', () => {
  it('applies "up" direction for positive delta in non-inverted category (Juros)', () => {
    render(<DeltaBadge value={0.5} category="Juros" />)
    const badge = screen.getByTestId('delta-badge')
    expect(badge).toHaveAttribute('data-direction', 'up')
  })

  it('applies "down" direction for positive delta in inverted category (Inflação — piora)', () => {
    render(<DeltaBadge value={0.3} category="Inflação" />)
    const badge = screen.getByTestId('delta-badge')
    expect(badge).toHaveAttribute('data-direction', 'down')
  })

  it('applies "up" direction for negative delta in inverted category (Inflação falling — melhora)', () => {
    render(<DeltaBadge value={-0.1} category="Inflação" />)
    const badge = screen.getByTestId('delta-badge')
    expect(badge).toHaveAttribute('data-direction', 'up')
  })

  it('applies "down" direction for negative delta in normal category (Mercado falling)', () => {
    render(<DeltaBadge value={-100} category="Mercado" />)
    const badge = screen.getByTestId('delta-badge')
    expect(badge).toHaveAttribute('data-direction', 'down')
  })

  it('applies "neutral" direction for zero delta', () => {
    render(<DeltaBadge value={0} category="Câmbio" />)
    const badge = screen.getByTestId('delta-badge')
    expect(badge).toHaveAttribute('data-direction', 'neutral')
  })

  it('renders correct arrow for up direction', () => {
    render(<DeltaBadge value={1} category="Mercado" />)
    expect(screen.getByTestId('delta-badge').textContent).toContain('▲')
  })

  it('renders correct arrow for down direction', () => {
    render(<DeltaBadge value={-1} category="Mercado" />)
    expect(screen.getByTestId('delta-badge').textContent).toContain('▼')
  })

  it('renders unit when provided', () => {
    render(<DeltaBadge value={0.5} category="Juros" unit="%" />)
    expect(screen.getByTestId('delta-badge').textContent).toContain('%')
  })

  it('respects direction override prop', () => {
    // Positive value in Inflação would normally be "down", but override forces "up"
    render(<DeltaBadge value={1} category="Inflação" direction="up" />)
    const badge = screen.getByTestId('delta-badge')
    expect(badge).toHaveAttribute('data-direction', 'up')
  })
})
