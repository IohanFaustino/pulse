/**
 * AnalysisPanel tests — open/close, accordion expand, apply, chart, exports.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AnalysisPanel from './index'

// ── Mock transform mutation ───────────────────────────────────────────────────

const mockMutate = vi.fn()

vi.mock('@/hooks/useTransform', () => ({
  useTransformMutation: () => ({
    mutate: mockMutate,
    isPending: false,
    isError: false,
  }),
}))

// ── Mock Chart component ──────────────────────────────────────────────────────

vi.mock('@/components/Chart', () => ({
  default: vi.fn(({ data, format }: { data: unknown[]; format: string }) => (
    <svg data-testid="chart" data-format={format} data-points={data.length} />
  )),
}))

// ── Mock export helpers ───────────────────────────────────────────────────────

vi.mock('@/lib/exportSvg', () => ({
  exportSvgToPng: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/exportCsv', () => ({
  exportCsv: vi.fn(),
}))

const SERIES = { code: 'IPCA', name: 'Índice Nacional de Preços ao Consumidor Amplo' }

function renderPanel(open = true, onClose = vi.fn()) {
  return render(<AnalysisPanel series={SERIES} open={open} onClose={onClose} />)
}

describe('AnalysisPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── Visibility ──────────────────────────────────────────────────────────────

  it('renders nothing when open=false', () => {
    renderPanel(false)
    expect(screen.queryByTestId('analysis-panel')).not.toBeInTheDocument()
  })

  it('renders panel when open=true', () => {
    renderPanel()
    expect(screen.getByTestId('analysis-panel')).toBeInTheDocument()
  })

  it('shows series code and name in header', () => {
    renderPanel()
    const panel = screen.getByTestId('analysis-panel')
    expect(panel.textContent).toContain('IPCA')
    expect(panel.textContent).toContain('Índice Nacional de Preços ao Consumidor Amplo')
  })

  // ── Close behavior ──────────────────────────────────────────────────────────

  it('calls onClose when X button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderPanel(true, onClose)
    await user.click(screen.getByTestId('analysis-panel-close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when scrim (backdrop) is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderPanel(true, onClose)
    await user.click(screen.getByTestId('analysis-panel-scrim'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when Escape key is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderPanel(true, onClose)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  // ── Accordion ───────────────────────────────────────────────────────────────

  it('transform accordion body is visible by default', () => {
    renderPanel()
    expect(screen.getByTestId('ap-transform-body')).toBeInTheDocument()
  })

  it('format accordion body is visible by default', () => {
    renderPanel()
    expect(screen.getByTestId('ap-format-body')).toBeInTheDocument()
  })

  it('collapsing transform accordion hides the body', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByTestId('ap-accordion-transform'))
    expect(screen.queryByTestId('ap-transform-body')).not.toBeInTheDocument()
  })

  it('collapsing format accordion hides the body', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByTestId('ap-accordion-format'))
    expect(screen.queryByTestId('ap-format-body')).not.toBeInTheDocument()
  })

  // ── Transform radio groups ──────────────────────────────────────────────────

  it('renders all transform groups', () => {
    renderPanel()
    expect(screen.getByTestId('ap-group-original')).toBeInTheDocument()
    expect(screen.getByTestId('ap-group-variacao')).toBeInTheDocument()
    expect(screen.getByTestId('ap-group-suavizacao')).toBeInTheDocument()
    expect(screen.getByTestId('ap-group-janelas')).toBeInTheDocument()
    expect(screen.getByTestId('ap-group-normalizacao')).toBeInTheDocument()
  })

  it('level radio is selected by default', () => {
    renderPanel()
    expect(screen.getByTestId('ap-radio-level')).toBeChecked()
  })

  it('selecting a different op radio updates selection', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByTestId('ap-radio-yoy'))
    expect(screen.getByTestId('ap-radio-yoy')).toBeChecked()
    expect(screen.getByTestId('ap-radio-level')).not.toBeChecked()
  })

  // ── Format radios ───────────────────────────────────────────────────────────

  it('renders format options', () => {
    renderPanel()
    expect(screen.getByTestId('ap-format-line')).toBeInTheDocument()
    expect(screen.getByTestId('ap-format-bar')).toBeInTheDocument()
    expect(screen.getByTestId('ap-format-area')).toBeInTheDocument()
  })

  it('line format is selected by default', () => {
    renderPanel()
    expect(screen.getByTestId('ap-format-line')).toBeChecked()
  })

  // ── Apply ───────────────────────────────────────────────────────────────────

  it('renders Apply button', () => {
    renderPanel()
    expect(screen.getByTestId('ap-apply-btn')).toBeInTheDocument()
  })

  it('clicking Apply calls mutation.mutate', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByTestId('ap-apply-btn'))
    expect(mockMutate).toHaveBeenCalledOnce()
    // Called with the spec for 'level'
    expect(mockMutate).toHaveBeenCalledWith(
      { op: 'level' },
      expect.any(Object),
    )
  })

  it('chart section is not visible before Apply', () => {
    renderPanel()
    expect(screen.queryByTestId('ap-chart-section')).not.toBeInTheDocument()
  })

  it('chart section appears after successful Apply', async () => {
    const user = userEvent.setup()

    // Override mutate to call onSuccess immediately
    mockMutate.mockImplementation((_spec: unknown, { onSuccess }: { onSuccess: (data: unknown) => void }) => {
      onSuccess({
        values: [
          { date: '2026-01-01T00:00:00Z', value: 4.5 },
          { date: '2026-02-01T00:00:00Z', value: 4.8 },
        ],
        series_code: 'IPCA',
        metadata: {},
      })
    })

    renderPanel()
    await user.click(screen.getByTestId('ap-apply-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('ap-chart-section')).toBeInTheDocument()
    })
    expect(screen.getByTestId('chart')).toBeInTheDocument()
  })

  // ── Export buttons (only appear after apply) ───────────────────────────────

  it('save image button appears after apply', async () => {
    const user = userEvent.setup()

    mockMutate.mockImplementation((_spec: unknown, { onSuccess }: { onSuccess: (data: unknown) => void }) => {
      onSuccess({
        values: [{ date: '2026-01-01T00:00:00Z', value: 4.5 }],
        series_code: 'IPCA',
        metadata: {},
      })
    })

    renderPanel()
    await user.click(screen.getByTestId('ap-apply-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('ap-save-image')).toBeInTheDocument()
    })
  })

  it('save data button appears after apply', async () => {
    const user = userEvent.setup()

    mockMutate.mockImplementation((_spec: unknown, { onSuccess }: { onSuccess: (data: unknown) => void }) => {
      onSuccess({
        values: [{ date: '2026-01-01T00:00:00Z', value: 4.5 }],
        series_code: 'IPCA',
        metadata: {},
      })
    })

    renderPanel()
    await user.click(screen.getByTestId('ap-apply-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('ap-save-data')).toBeInTheDocument()
    })
  })

  it('clicking save data calls exportCsv with correct filename', async () => {
    const { exportCsv } = await import('@/lib/exportCsv')
    const user = userEvent.setup()

    mockMutate.mockImplementation((_spec: unknown, { onSuccess }: { onSuccess: (data: unknown) => void }) => {
      onSuccess({
        values: [
          { date: '2026-01-01T00:00:00Z', value: 4.5 },
          { date: '2026-02-01T00:00:00Z', value: 4.8 },
        ],
        series_code: 'IPCA',
        metadata: {},
      })
    })

    renderPanel()
    await user.click(screen.getByTestId('ap-apply-btn'))

    await waitFor(() => screen.getByTestId('ap-save-data'))
    await user.click(screen.getByTestId('ap-save-data'))

    expect(exportCsv).toHaveBeenCalledOnce()
    const [rows, filename] = vi.mocked(exportCsv).mock.calls[0]
    expect(filename).toBe('IPCA_level.csv')
    expect(Array.isArray(rows)).toBe(true)
    expect((rows as { date: string; value: number }[])[0]).toEqual({ date: '2026-01-01', value: 4.5 })
  })
})
