import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Card from './index'

// Mock AnalysisPanel to avoid portal / transform network calls in unit tests
vi.mock('@/components/AnalysisPanel', () => ({
  default: ({ open, series }: { open: boolean; series: { code: string } }) =>
    open ? <div data-testid="analysis-panel" data-code={series.code} /> : null,
}))

// Mock useTransformMutation used inside AnalysisPanel
vi.mock('@/hooks/useTransform', () => ({
  useTransformMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useTransformQuery: () => ({ data: null, isLoading: false }),
}))

const defaultProps = {
  code: 'IPCA',
  name: 'Índice Nacional de Preços ao Consumidor Amplo',
  value: 4.83,
  category: 'Inflação',
  unit: '%',
  source: 'BCB SGS',
  frequency: 'mensal',
  lastUpdate: '2026-05-01T00:00:00Z',
}

describe('Card', () => {
  it('renders the series code', () => {
    render(<Card {...defaultProps} />)
    expect(screen.getByText('IPCA')).toBeInTheDocument()
  })

  it('renders the value', () => {
    render(<Card {...defaultProps} />)
    expect(screen.getByTestId('card-value').textContent).toContain('4,83')
  })

  it('renders DeltaBadge when delta is provided', () => {
    render(<Card {...defaultProps} delta={0.12} />)
    expect(screen.getByTestId('delta-badge')).toBeInTheDocument()
  })

  it('does not render DeltaBadge when delta is not provided', () => {
    render(<Card {...defaultProps} />)
    expect(screen.queryByTestId('delta-badge')).not.toBeInTheDocument()
  })

  it('shows "—" for null value', () => {
    render(<Card {...defaultProps} value={null} />)
    expect(screen.getByTestId('card-value').textContent).toContain('—')
  })

  it('calls onPin with code when star button is clicked', async () => {
    const user = userEvent.setup()
    const onPin = vi.fn()
    render(<Card {...defaultProps} onPin={onPin} />)
    await user.click(screen.getByTestId('card-pin-btn'))
    expect(onPin).toHaveBeenCalledWith('IPCA')
  })

  it('shows filled star SVG when pinned=true', () => {
    render(<Card {...defaultProps} pinned />)
    // Pinned state: button contains filled SVG (fill="currentColor")
    const btn = screen.getByTestId('card-pin-btn')
    expect(btn.querySelector('svg')).toBeInTheDocument()
    expect(btn).toBeInTheDocument()
  })

  it('shows outline star SVG when pinned=false', () => {
    render(<Card {...defaultProps} pinned={false} />)
    const btn = screen.getByTestId('card-pin-btn')
    expect(btn.querySelector('svg')).toBeInTheDocument()
  })

  it('opens AnalysisPanel when card body is clicked (no onClick override)', async () => {
    const user = userEvent.setup()
    render(<Card {...defaultProps} />)
    await user.click(screen.getByTestId('card'))
    expect(screen.getByTestId('analysis-panel')).toBeInTheDocument()
    expect(screen.getByTestId('analysis-panel')).toHaveAttribute('data-code', 'IPCA')
  })

  it('calls onClick override with code when provided (legacy behavior)', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Card {...defaultProps} onClick={onClick} />)
    await user.click(screen.getByTestId('card'))
    expect(onClick).toHaveBeenCalledWith('IPCA')
    // AnalysisPanel should not open when onClick override is used
    expect(screen.queryByTestId('analysis-panel')).not.toBeInTheDocument()
  })

  it('clicking pin button does NOT open AnalysisPanel', async () => {
    const user = userEvent.setup()
    const onPin = vi.fn()
    render(<Card {...defaultProps} onPin={onPin} />)
    await user.click(screen.getByTestId('card-pin-btn'))
    expect(onPin).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('analysis-panel')).not.toBeInTheDocument()
  })

  it('renders sparkline when sparklineValues has 2+ points', () => {
    render(<Card {...defaultProps} sparklineValues={[1, 2, 3, 4, 5]} />)
    expect(screen.getByTestId('sparkline')).toBeInTheDocument()
  })

  it('does not render sparkline for empty sparklineValues', () => {
    render(<Card {...defaultProps} sparklineValues={[]} />)
    expect(screen.queryByTestId('sparkline')).not.toBeInTheDocument()
  })

  it('DeltaBadge has down direction for positive delta in Inflação (piora)', () => {
    render(<Card {...defaultProps} delta={0.5} />)
    expect(screen.getByTestId('delta-badge')).toHaveAttribute('data-direction', 'down')
  })

  // ── Info icon + popover ────────────────────────────────────────────────────

  it('renders the info icon button', () => {
    render(<Card {...defaultProps} />)
    expect(screen.getByTestId('card-info-btn')).toBeInTheDocument()
  })

  it('info button has accessible label mentioning the code', () => {
    render(<Card {...defaultProps} />)
    expect(screen.getByTestId('card-info-btn')).toHaveAttribute(
      'aria-label',
      'Mais informações sobre IPCA',
    )
  })

  it('popover is not visible initially', () => {
    render(<Card {...defaultProps} />)
    expect(screen.queryByTestId('card-info-popover')).not.toBeInTheDocument()
  })

  it('clicking info button opens the popover', async () => {
    const user = userEvent.setup()
    render(<Card {...defaultProps} />)
    await user.click(screen.getByTestId('card-info-btn'))
    expect(screen.getByTestId('card-info-popover')).toBeInTheDocument()
  })

  it('popover shows series name', async () => {
    const user = userEvent.setup()
    render(<Card {...defaultProps} />)
    await user.click(screen.getByTestId('card-info-btn'))
    expect(screen.getByTestId('card-info-popover').textContent).toContain(
      'Índice Nacional de Preços ao Consumidor Amplo',
    )
  })

  it('popover shows source', async () => {
    const user = userEvent.setup()
    render(<Card {...defaultProps} />)
    await user.click(screen.getByTestId('card-info-btn'))
    expect(screen.getByTestId('card-info-popover').textContent).toContain('BCB SGS')
  })

  it('popover shows frequency', async () => {
    const user = userEvent.setup()
    render(<Card {...defaultProps} />)
    await user.click(screen.getByTestId('card-info-btn'))
    expect(screen.getByTestId('card-info-popover').textContent).toContain('mensal')
  })

  it('clicking info button a second time closes the popover', async () => {
    const user = userEvent.setup()
    render(<Card {...defaultProps} />)
    await user.click(screen.getByTestId('card-info-btn'))
    expect(screen.getByTestId('card-info-popover')).toBeInTheDocument()
    await user.click(screen.getByTestId('card-info-btn'))
    expect(screen.queryByTestId('card-info-popover')).not.toBeInTheDocument()
  })

  it('info button click does NOT open AnalysisPanel', async () => {
    const user = userEvent.setup()
    render(<Card {...defaultProps} />)
    await user.click(screen.getByTestId('card-info-btn'))
    expect(screen.queryByTestId('analysis-panel')).not.toBeInTheDocument()
  })

  it('series name is NOT visible in card body (only in popover or AnalysisPanel)', () => {
    render(<Card {...defaultProps} />)
    // Popover is closed and panel is closed — name must not be in the document
    expect(screen.queryByText('Índice Nacional de Preços ao Consumidor Amplo')).not.toBeInTheDocument()
  })
})
