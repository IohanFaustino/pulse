/**
 * DailyRow component tests — Vitest + React Testing Library
 *
 * Covers:
 *   - Renders section heading "Diariamente" and sub-label when daily series exist
 *   - Renders one chip per daily-frequency series (7 from seed data)
 *   - Hides section entirely when no daily series exist
 *   - Skeleton chips shown while data is loading
 *   - Clicking a chip opens AnalysisPanel with the correct series
 *   - Freshness dot: green (≤24h), amber (24-72h), red (>72h), unknown (no timestamp)
 *   - Chip is keyboard accessible (Enter / Space opens panel)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@/hooks/useSeries', () => ({ useSeries: vi.fn() }))
vi.mock('@/hooks/useObservations', () => ({ useObservations: vi.fn() }))
vi.mock('@/hooks/useHealth', () => ({ useHealth: vi.fn() }))

// Lightweight AnalysisPanel stub so we can assert on the open call
vi.mock('@/components/AnalysisPanel', () => ({
  default: ({ series, open, onClose }: { series: { code: string; name: string }; open: boolean; onClose: () => void }) =>
    open ? (
      <div data-testid="analysis-panel" data-code={series.code}>
        <button data-testid="analysis-panel-close" onClick={onClose}>
          Fechar
        </button>
      </div>
    ) : null,
}))

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import DailyRow from './index'
import { useSeries } from '@/hooks/useSeries'
import { useObservations } from '@/hooks/useObservations'
import { useHealth } from '@/hooks/useHealth'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DAILY_SERIES = [
  { code: 'SELIC',     name: 'Taxa SELIC',   category: 'Juros',   source: 'BCB SGS',      frequency: 'daily', unit: '% a.a.', status: 'fresh', last_success_at: null, last_extraction_at: null, source_id: '11', first_observation: '1986-01-01' },
  { code: 'CDI',       name: 'CDI',          category: 'Juros',   source: 'BCB SGS',      frequency: 'daily', unit: '% a.a.', status: 'fresh', last_success_at: null, last_extraction_at: null, source_id: '12', first_observation: '1986-01-01' },
  { code: 'TR',        name: 'Taxa Referencial', category: 'Juros', source: 'BCB SGS',    frequency: 'daily', unit: '%',      status: 'fresh', last_success_at: null, last_extraction_at: null, source_id: '226', first_observation: '1991-01-01' },
  { code: 'PTAX_USD',  name: 'PTAX Dólar',   category: 'Câmbio',  source: 'BCB SGS',      frequency: 'daily', unit: 'R$',     status: 'fresh', last_success_at: null, last_extraction_at: null, source_id: '1', first_observation: '1984-01-01' },
  { code: 'PTAX_EUR',  name: 'PTAX Euro',    category: 'Câmbio',  source: 'BCB SGS',      frequency: 'daily', unit: 'R$',     status: 'fresh', last_success_at: null, last_extraction_at: null, source_id: '21619', first_observation: '1999-01-01' },
  { code: 'IBOV',      name: 'Ibovespa',     category: 'Mercado', source: 'Yahoo Finance', frequency: 'daily', unit: 'pts',    status: 'fresh', last_success_at: null, last_extraction_at: null, source_id: '^BVSP', first_observation: '1993-01-01' },
  { code: 'IFIX',      name: 'IFIX',         category: 'Mercado', source: 'Yahoo Finance', frequency: 'daily', unit: 'pts',    status: 'fresh', last_success_at: null, last_extraction_at: null, source_id: 'IFIX11.SA', first_observation: '2012-01-01' },
]

const MONTHLY_SERIES = [
  { code: 'IPCA', name: 'IPCA', category: 'Inflação', source: 'IBGE SIDRA', frequency: 'monthly', unit: '%', status: 'fresh', last_success_at: null, last_extraction_at: null, source_id: '433', first_observation: '1980-01-01' },
]

const ALL_SERIES = [...DAILY_SERIES, ...MONTHLY_SERIES]

const EMPTY_OBS = {
  series_code: 'SELIC',
  items: [],
  total: 0,
  returned: 0,
  limit: 20,
}

const TWO_OBS = (code: string) => ({
  series_code: code,
  items: [
    { observed_at: '2026-05-09T00:00:00Z', value: 14.65, ingested_at: '2026-05-09T18:00:00Z' },
    { observed_at: '2026-05-10T00:00:00Z', value: 14.75, ingested_at: '2026-05-10T18:00:00Z' },
  ],
  total: 2,
  returned: 2,
  limit: 20,
})

const HEALTH_NONE = {
  status: 'ok',
  series: [],
  checked_at: new Date().toISOString(),
  sync_at: null,
}

// ── Test wrapper ──────────────────────────────────────────────────────────────

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

function setupDefaultMocks() {
  vi.mocked(useSeries).mockReturnValue({
    data: { items: ALL_SERIES, total: ALL_SERIES.length },
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof useSeries>)

  vi.mocked(useObservations).mockReturnValue({
    data: EMPTY_OBS,
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof useObservations>)

  vi.mocked(useHealth).mockReturnValue({
    data: HEALTH_NONE,
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof useHealth>)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DailyRow component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultMocks()
  })

  // ── Section visibility ─────────────────────────────────────────────────────

  it('renders the section with heading "Diariamente"', () => {
    render(<DailyRow />, { wrapper: createWrapper() })
    expect(screen.getByTestId('daily-row-section')).toBeInTheDocument()
    expect(screen.getByTestId('daily-row-title')).toHaveTextContent('Diariamente')
  })

  it('renders the sub-label "atualizações diárias via API"', () => {
    render(<DailyRow />, { wrapper: createWrapper() })
    expect(screen.getByText('atualizações diárias via API')).toBeInTheDocument()
  })

  it('hides section entirely when no daily series exist', () => {
    vi.mocked(useSeries).mockReturnValue({
      data: { items: MONTHLY_SERIES, total: MONTHLY_SERIES.length },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useSeries>)
    render(<DailyRow />, { wrapper: createWrapper() })
    expect(screen.queryByTestId('daily-row-section')).not.toBeInTheDocument()
  })

  // ── Chip count ─────────────────────────────────────────────────────────────

  it('renders exactly 7 chips for the 7 daily series from seed', () => {
    render(<DailyRow />, { wrapper: createWrapper() })
    const chips = screen.getAllByTestId('daily-chip')
    expect(chips).toHaveLength(7)
  })

  it('renders chip with correct data-code attribute for each daily series', () => {
    render(<DailyRow />, { wrapper: createWrapper() })
    const chips = screen.getAllByTestId('daily-chip')
    const codes = chips.map((c) => c.dataset.code)
    for (const s of DAILY_SERIES) {
      expect(codes).toContain(s.code)
    }
  })

  // ── Loading skeleton ───────────────────────────────────────────────────────

  it('shows skeleton chips while series data is loading', () => {
    vi.mocked(useSeries).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as ReturnType<typeof useSeries>)
    render(<DailyRow />, { wrapper: createWrapper() })
    expect(screen.getAllByTestId('daily-chip-skeleton').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('daily-chip')).not.toBeInTheDocument()
  })

  // ── Click → AnalysisPanel ──────────────────────────────────────────────────

  it('opens AnalysisPanel with the clicked series code', async () => {
    const user = userEvent.setup()
    render(<DailyRow />, { wrapper: createWrapper() })

    expect(screen.queryByTestId('analysis-panel')).not.toBeInTheDocument()

    const chips = screen.getAllByTestId('daily-chip')
    await user.click(chips[0]!)

    const panel = screen.getByTestId('analysis-panel')
    expect(panel).toBeInTheDocument()
    // The first chip is SELIC
    expect(panel.dataset.code).toBe('SELIC')
  })

  it('closes AnalysisPanel when onClose is triggered', async () => {
    const user = userEvent.setup()
    render(<DailyRow />, { wrapper: createWrapper() })

    await user.click(screen.getAllByTestId('daily-chip')[0]!)
    expect(screen.getByTestId('analysis-panel')).toBeInTheDocument()

    await user.click(screen.getByTestId('analysis-panel-close'))
    expect(screen.queryByTestId('analysis-panel')).not.toBeInTheDocument()
  })

  // ── Keyboard accessibility ─────────────────────────────────────────────────

  it('opens AnalysisPanel on Enter key press on a chip', async () => {
    const user = userEvent.setup()
    render(<DailyRow />, { wrapper: createWrapper() })

    const chip = screen.getAllByTestId('daily-chip')[0]!
    chip.focus()
    await user.keyboard('{Enter}')

    expect(screen.getByTestId('analysis-panel')).toBeInTheDocument()
  })

  it('opens AnalysisPanel on Space key press on a chip', async () => {
    const user = userEvent.setup()
    render(<DailyRow />, { wrapper: createWrapper() })

    const chip = screen.getAllByTestId('daily-chip')[0]!
    chip.focus()
    await user.keyboard(' ')

    expect(screen.getByTestId('analysis-panel')).toBeInTheDocument()
  })

  // ── Value display ──────────────────────────────────────────────────────────

  it('renders last value for a chip when observations are available', () => {
    vi.mocked(useObservations).mockImplementation(({ code }) => ({
      data: TWO_OBS(code),
      isLoading: false,
      isError: false,
      error: null,
    }) as ReturnType<typeof useObservations>)
    render(<DailyRow />, { wrapper: createWrapper() })
    // 14.75 formatted in pt-BR → "14,75"
    const values = screen.getAllByText(/14,75/)
    expect(values.length).toBeGreaterThan(0)
  })

  // ── Freshness dot ──────────────────────────────────────────────────────────

  it('shows fresh dot (data-status=fresh) for last_success_at within 24h', () => {
    const recentTs = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() // 2h ago
    vi.mocked(useHealth).mockReturnValue({
      data: {
        status: 'ok',
        series: DAILY_SERIES.map((s) => ({
          code: s.code,
          status: 'fresh',
          last_success_at: recentTs,
        })),
        checked_at: new Date().toISOString(),
        sync_at: recentTs,
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useHealth>)
    render(<DailyRow />, { wrapper: createWrapper() })
    const dots = document.querySelectorAll('[data-status="fresh"]')
    expect(dots.length).toBeGreaterThan(0)
  })

  it('shows stale dot (data-status=stale) for last_success_at between 24-72h', () => {
    const staleTs = new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString() // 36h ago
    vi.mocked(useHealth).mockReturnValue({
      data: {
        status: 'degraded',
        series: DAILY_SERIES.map((s) => ({
          code: s.code,
          status: 'stale',
          last_success_at: staleTs,
        })),
        checked_at: new Date().toISOString(),
        sync_at: staleTs,
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useHealth>)
    render(<DailyRow />, { wrapper: createWrapper() })
    const dots = document.querySelectorAll('[data-status="stale"]')
    expect(dots.length).toBeGreaterThan(0)
  })

  it('shows failed dot (data-status=failed) for last_success_at older than 72h', () => {
    const oldTs = new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString() // 100h ago
    vi.mocked(useHealth).mockReturnValue({
      data: {
        status: 'degraded',
        series: DAILY_SERIES.map((s) => ({
          code: s.code,
          status: 'failed',
          last_success_at: oldTs,
        })),
        checked_at: new Date().toISOString(),
        sync_at: oldTs,
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useHealth>)
    render(<DailyRow />, { wrapper: createWrapper() })
    const dots = document.querySelectorAll('[data-status="failed"]')
    expect(dots.length).toBeGreaterThan(0)
  })

  it('shows unknown dot (data-status=unknown) when no timestamp is available', () => {
    render(<DailyRow />, { wrapper: createWrapper() })
    const dots = document.querySelectorAll('[data-status="unknown"]')
    expect(dots.length).toBeGreaterThan(0)
  })

  // ── Source badge ───────────────────────────────────────────────────────────

  it('shows BCB source badge for BCB SGS series', () => {
    render(<DailyRow />, { wrapper: createWrapper() })
    const badges = screen.getAllByText('BCB')
    expect(badges.length).toBeGreaterThan(0)
  })

  it('shows Yahoo source badge for Yahoo Finance series', () => {
    render(<DailyRow />, { wrapper: createWrapper() })
    const badges = screen.getAllByText('Yahoo')
    expect(badges.length).toBeGreaterThan(0)
  })

  // ── Horizontal scroll container ────────────────────────────────────────────

  it('renders a scrollable track container', () => {
    render(<DailyRow />, { wrapper: createWrapper() })
    const track = screen.getByTestId('daily-row-track')
    expect(track).toBeInTheDocument()
  })
})
