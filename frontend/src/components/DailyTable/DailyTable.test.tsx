/**
 * DailyTable tests — phase 21.
 *
 * Covers:
 *   - Renders section with title and subtitle
 *   - Filters to daily + event frequency only
 *   - Renders correct status dots based on freshness
 *   - Sort by Código (default) and Última coleta
 *   - Shows loading skeleton
 *   - Click row opens AnalysisPanel
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/hooks/useSeries', () => ({
  useSeries: vi.fn(),
}))

vi.mock('@/hooks/useHealth', () => ({
  useHealth: vi.fn(),
}))

vi.mock('@/components/AnalysisPanel', () => ({
  default: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="analysis-panel-mock">
        <button onClick={onClose} data-testid="analysis-panel-close">X</button>
      </div>
    ) : null,
}))

import { useSeries } from '@/hooks/useSeries'
import { useHealth } from '@/hooks/useHealth'
import DailyTable from './index'

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockUseSeries = vi.mocked(useSeries)
const mockUseHealth = vi.mocked(useHealth)

const now = new Date()
const recentTs = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString()    // 2h ago → fresh
const staleTs = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()    // 48h ago → stale
const failedTs = new Date(now.getTime() - 100 * 60 * 60 * 1000).toISOString()  // 100h ago → failed

const MOCK_SERIES = {
  items: [
    {
      code: 'SELIC',
      name: 'Taxa SELIC',
      category: 'Juros',
      source: 'BCB SGS',
      source_id: '11',
      frequency: 'daily',
      unit: '% a.a.',
      first_observation: '2000-01-01',
      last_extraction_at: recentTs,
      last_success_at: recentTs,
      status: 'fresh',
    },
    {
      code: 'CDI',
      name: 'CDI Diário',
      category: 'Juros',
      source: 'BCB SGS',
      source_id: '12',
      frequency: 'daily',
      unit: '% a.a.',
      first_observation: '2000-01-01',
      last_extraction_at: staleTs,
      last_success_at: staleTs,
      status: 'stale',
    },
    {
      code: 'IPCA',
      name: 'IPCA',
      category: 'Inflação',
      source: 'IBGE SIDRA',
      source_id: '433',
      frequency: 'monthly', // not daily — should be excluded
      unit: '%',
      first_observation: '1980-01-01',
      last_extraction_at: null,
      last_success_at: null,
      status: 'fresh',
    },
    {
      code: 'ANBIMA_EVENT',
      name: 'ANBIMA Evento',
      category: 'Renda Fixa',
      source: 'ANBIMA',
      source_id: 'anbima_1',
      frequency: 'event',
      unit: '%',
      first_observation: null,
      last_extraction_at: failedTs,
      last_success_at: failedTs,
      status: 'failed',
    },
  ],
  total: 4,
}

const MOCK_HEALTH = {
  status: 'ok',
  series: [
    { code: 'SELIC', last_success_at: recentTs, status: 'fresh' },
    { code: 'CDI',   last_success_at: staleTs,  status: 'stale' },
    { code: 'ANBIMA_EVENT', last_success_at: failedTs, status: 'failed' },
  ],
  oldest_success_at: null,
}

function renderTable() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <DailyTable />
    </QueryClientProvider>
  )
}

// ── Default setup ─────────────────────────────────────────────────────────────

beforeEach(() => {
  mockUseSeries.mockReturnValue({
    data: MOCK_SERIES,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useSeries>)

  mockUseHealth.mockReturnValue({
    data: MOCK_HEALTH,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useHealth>)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DailyTable', () => {
  it('renders section title and subtitle', () => {
    renderTable()
    expect(screen.getByTestId('daily-table-title')).toHaveTextContent('Coletados diariamente')
    expect(screen.getByText(/Mon-Fri 18:00 BRT/i)).toBeInTheDocument()
  })

  it('renders only daily + event frequency series (excludes monthly)', () => {
    renderTable()
    const rows = screen.getAllByTestId('daily-table-row')
    // SELIC (daily), CDI (daily), ANBIMA_EVENT (event) = 3 rows; IPCA (monthly) excluded
    expect(rows).toHaveLength(3)
    // Verify IPCA is not shown
    expect(screen.queryByText('IPCA')).not.toBeInTheDocument()
  })

  it('renders table with correct columns', () => {
    renderTable()
    const table = screen.getByTestId('daily-table')
    expect(table).toBeInTheDocument()
    expect(screen.getByTestId('daily-table-sort-code')).toBeInTheDocument()
    expect(screen.getByTestId('daily-table-sort-date')).toBeInTheDocument()
  })

  it('shows fresh (green) status dot for series updated within 24h', () => {
    renderTable()
    const dots = screen.getAllByTestId('daily-table-dot')
    const freshDot = dots.find((d) => d.getAttribute('data-status') === 'fresh')
    expect(freshDot).toBeTruthy()
  })

  it('shows stale (amber) status dot for series updated 24-72h ago', () => {
    renderTable()
    const dots = screen.getAllByTestId('daily-table-dot')
    const staleDot = dots.find((d) => d.getAttribute('data-status') === 'stale')
    expect(staleDot).toBeTruthy()
  })

  it('shows failed (red) status dot for series updated >72h ago', () => {
    renderTable()
    const dots = screen.getAllByTestId('daily-table-dot')
    const failedDot = dots.find((d) => d.getAttribute('data-status') === 'failed')
    expect(failedDot).toBeTruthy()
  })

  it('sorts by Código ascending by default', () => {
    renderTable()
    const rows = screen.getAllByTestId('daily-table-row')
    const codes = rows.map((r) => r.getAttribute('data-code'))
    const sorted = [...codes].sort()
    expect(codes).toEqual(sorted)
  })

  it('toggles sort direction on Código column click', async () => {
    const user = userEvent.setup()
    renderTable()

    const sortCodeBtn = screen.getByTestId('daily-table-sort-code')
    await user.click(sortCodeBtn)

    // Should now be descending
    const rows = screen.getAllByTestId('daily-table-row')
    const codes = rows.map((r) => r.getAttribute('data-code'))
    const sortedDesc = [...codes].sort().reverse()
    expect(codes).toEqual(sortedDesc)
  })

  it('sorts by Última coleta on column click', async () => {
    const user = userEvent.setup()
    renderTable()

    const sortDateBtn = screen.getByTestId('daily-table-sort-date')
    await user.click(sortDateBtn)

    // After click: should be aria-sort="ascending" or "descending"
    expect(sortDateBtn.getAttribute('aria-sort')).not.toBe('none')
  })

  it('shows loading skeleton during fetch', () => {
    mockUseSeries.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useSeries>)

    renderTable()
    expect(screen.getByTestId('daily-table-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('daily-table')).not.toBeInTheDocument()
  })

  it('returns null when no daily/event series exist', () => {
    mockUseSeries.mockReturnValue({
      data: {
        items: [
          {
            code: 'IPCA',
            name: 'IPCA',
            category: 'Inflação',
            source: 'IBGE SIDRA',
            source_id: '433',
            frequency: 'monthly',
            unit: '%',
            first_observation: null,
            last_extraction_at: null,
            last_success_at: null,
            status: 'fresh',
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useSeries>)

    const { container } = renderTable()
    expect(container.firstChild).toBeNull()
  })

  it('opens AnalysisPanel when a row is clicked', async () => {
    const user = userEvent.setup()
    renderTable()

    const rows = screen.getAllByTestId('daily-table-row')
    await user.click(rows[0]!)

    expect(screen.getByTestId('analysis-panel-mock')).toBeInTheDocument()
  })

  it('closes AnalysisPanel on close button click', async () => {
    const user = userEvent.setup()
    renderTable()

    const rows = screen.getAllByTestId('daily-table-row')
    await user.click(rows[0]!)
    expect(screen.getByTestId('analysis-panel-mock')).toBeInTheDocument()

    await user.click(screen.getByTestId('analysis-panel-close'))
    await waitFor(() => {
      expect(screen.queryByTestId('analysis-panel-mock')).not.toBeInTheDocument()
    })
  })

  it('opens AnalysisPanel via keyboard Enter on row', async () => {
    const user = userEvent.setup()
    renderTable()

    const rows = screen.getAllByTestId('daily-table-row')
    rows[0]!.focus()
    await user.keyboard('{Enter}')

    expect(screen.getByTestId('analysis-panel-mock')).toBeInTheDocument()
  })
})
