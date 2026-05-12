import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SmallMultiple from './index'

// Mock AnalysisPanel to avoid portal/transform network calls in unit tests
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
  code: 'SELIC',
  name: 'Taxa SELIC',
  value: 10.5,
  category: 'Juros',
  unit: '%',
}

describe('SmallMultiple', () => {
  it('renders the code', () => {
    render(<SmallMultiple {...defaultProps} />)
    expect(screen.getByText('SELIC')).toBeInTheDocument()
  })

  it('renders the formatted value', () => {
    render(<SmallMultiple {...defaultProps} />)
    expect(screen.getByTestId('sm-value').textContent).toContain('10,50')
  })

  it('shows "—" for null value', () => {
    render(<SmallMultiple {...defaultProps} value={null} />)
    expect(screen.getByTestId('sm-value').textContent).toContain('—')
  })

  it('renders DeltaBadge when delta is provided', () => {
    render(<SmallMultiple {...defaultProps} delta={0.25} />)
    expect(screen.getByTestId('delta-badge')).toBeInTheDocument()
  })

  it('action buttons are present in DOM (visible on hover via CSS)', () => {
    render(<SmallMultiple {...defaultProps} />)
    expect(screen.getByTestId('sm-unpin-btn')).toBeInTheDocument()
    expect(screen.getByTestId('sm-modify-btn')).toBeInTheDocument()
  })

  it('calls onUnpin with code when unpin button is clicked', async () => {
    const user = userEvent.setup()
    const onUnpin = vi.fn()
    render(<SmallMultiple {...defaultProps} onUnpin={onUnpin} />)
    await user.click(screen.getByTestId('sm-unpin-btn'))
    expect(onUnpin).toHaveBeenCalledWith('SELIC')
  })

  it('calls onModify with code when modify button is clicked', async () => {
    const user = userEvent.setup()
    const onModify = vi.fn()
    render(<SmallMultiple {...defaultProps} onModify={onModify} />)
    await user.click(screen.getByTestId('sm-modify-btn'))
    expect(onModify).toHaveBeenCalledWith('SELIC')
  })

  it('renders transform badge when activeTransform is set', () => {
    render(<SmallMultiple {...defaultProps} activeTransform="yoy" />)
    expect(screen.getByTestId('sm-transform-badge')).toBeInTheDocument()
    expect(screen.getByTestId('sm-transform-badge').textContent).toBe('yoy')
  })

  it('does not render transform badge when activeTransform is not set', () => {
    render(<SmallMultiple {...defaultProps} />)
    expect(screen.queryByTestId('sm-transform-badge')).not.toBeInTheDocument()
  })

  it('renders sparkline when sparklineValues has 2+ points', () => {
    render(<SmallMultiple {...defaultProps} sparklineValues={[10, 10.2, 10.4, 10.5]} />)
    expect(screen.getByTestId('sparkline')).toBeInTheDocument()
  })

  it('opens AnalysisPanel when card body is clicked (no onClick override)', async () => {
    const user = userEvent.setup()
    render(<SmallMultiple {...defaultProps} />)
    await user.click(screen.getByTestId('small-multiple'))
    expect(screen.getByTestId('analysis-panel')).toBeInTheDocument()
    expect(screen.getByTestId('analysis-panel')).toHaveAttribute('data-code', 'SELIC')
  })

  it('calls onClick override with code when provided', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<SmallMultiple {...defaultProps} onClick={onClick} />)
    await user.click(screen.getByTestId('small-multiple'))
    expect(onClick).toHaveBeenCalledWith('SELIC')
    expect(screen.queryByTestId('analysis-panel')).not.toBeInTheDocument()
  })

  it('clicking modify button does NOT open AnalysisPanel', async () => {
    const user = userEvent.setup()
    const onModify = vi.fn()
    render(<SmallMultiple {...defaultProps} onModify={onModify} />)
    await user.click(screen.getByTestId('sm-modify-btn'))
    expect(screen.queryByTestId('analysis-panel')).not.toBeInTheDocument()
  })

  it('clicking unpin button does NOT open AnalysisPanel', async () => {
    const user = userEvent.setup()
    const onUnpin = vi.fn()
    render(<SmallMultiple {...defaultProps} onUnpin={onUnpin} />)
    await user.click(screen.getByTestId('sm-unpin-btn'))
    expect(screen.queryByTestId('analysis-panel')).not.toBeInTheDocument()
  })
})
