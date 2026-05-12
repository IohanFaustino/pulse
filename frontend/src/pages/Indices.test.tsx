/**
 * Índices page — unit tests.
 *
 * All external hooks (useSeries, useUserPrefs, usePin, useObservations) are
 * mocked so tests run without a network or React Query provider.
 *
 * Covered:
 *   - Greeting and subtitle render (doc §4.1)
 *   - Search input present (doc §4.2)
 *   - Search filters by code substring (case-insensitive) (doc §4.2)
 *   - Search filters by name substring (doc §4.2)
 *   - Category tab filters by category (doc §4.3)
 *   - Pinned series do NOT appear in catalog (FR-4.1)
 *   - Star click calls pin mutation (FR-4.1, AC-2)
 *   - All-pinned → empty state renders (doc §4.5)
 *   - Search no-results → empty state renders (doc §4.5)
 *   - Sparkline rendered per card when observations available (doc §4.4)
 *   - Delta badge rendered per card (doc §4.4)
 *   - Card body click opens AnalysisPanel (no navigate to /metadados)
 *   - Loading skeleton shown while data loads
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Indices from './Indices'

// ── Mock hooks ────────────────────────────────────────────────────────────────

// We mock at the module level so every import of the hook in Indices.tsx
// sees the mocked version without needing a real QueryClientProvider.

vi.mock('@/hooks/useSeries')
vi.mock('@/hooks/useUserPrefs')
vi.mock('@/hooks/useObservations')

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

import { useSeries } from '@/hooks/useSeries'
import { useUserPrefs, usePin } from '@/hooks/useUserPrefs'
import { useObservations } from '@/hooks/useObservations'
// Note: useNavigate no longer needed — card click opens AnalysisPanel, not navigate

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockUseSeries = vi.mocked(useSeries)
const mockUseUserPrefs = vi.mocked(useUserPrefs)
const mockUsePin = vi.mocked(usePin)
const mockUseObservations = vi.mocked(useObservations)

/** Default pin mock — no active mutation */
const defaultPinMock = {
  pin: vi.fn(),
  mutate: vi.fn(),
  mutateAsync: vi.fn(),
  isPending: false,
  isError: false,
  isIdle: true,
  isSuccess: false,
  error: null,
  data: undefined,
  reset: vi.fn(),
  status: 'idle' as const,
  variables: undefined,
  context: undefined,
  failureCount: 0,
  failureReason: null,
  submittedAt: 0,
  isPaused: false,
}

/** Default empty observations (no sparkline / delta) */
const emptyObsMock = {
  data: { series_code: 'X', items: [], total: 0, returned: 0, limit: 24, from_dt: null, to_dt: null },
  isLoading: false,
  isError: false,
  isPending: false,
  isSuccess: true,
  error: null,
}

/** Two-point observations (enables sparkline + delta) */
function makeObsMock(code: string, values: number[]) {
  return {
    data: {
      series_code: code,
      items: values.map((v, i) => ({
        observed_at: `2026-0${i + 1}-01T00:00:00Z`,
        value: v,
        ingested_at: `2026-0${i + 1}-01T06:00:00Z`,
      })),
      total: values.length,
      returned: values.length,
      limit: 24,
      from_dt: null,
      to_dt: null,
    },
    isLoading: false,
    isError: false,
    isPending: false,
    isSuccess: true,
    error: null,
  }
}

/** Build a minimal SeriesRead object */
function makeSeries(overrides: { code: string; name: string; category: string }) {
  return {
    code: overrides.code,
    name: overrides.name,
    category: overrides.category,
    source: 'BCB SGS',
    source_id: '433',
    frequency: 'monthly',
    unit: '%',
    first_observation: '1980-01-01',
    last_extraction_at: '2026-05-01T00:00:00Z',
    last_success_at: '2026-05-01T00:00:00Z',
    status: 'fresh',
    metadata: null,
  }
}

const SERIES_IPCA = makeSeries({ code: 'IPCA', name: 'Índice Nacional de Preços ao Consumidor Amplo', category: 'Inflação' })
const SERIES_SELIC = makeSeries({ code: 'SELIC', name: 'Taxa Selic', category: 'Juros' })
const SERIES_CDI = makeSeries({ code: 'CDI', name: 'Certificado de Depósito Interbancário', category: 'Juros' })
const SERIES_PTAX = makeSeries({ code: 'PTAX_USD', name: 'Taxa de Câmbio PTAX USD', category: 'Câmbio' })

const ALL_SERIES = [SERIES_IPCA, SERIES_SELIC, SERIES_CDI, SERIES_PTAX]

/** Minimal UserPrefsRead with given pinned codes */
function makePrefs(pinnedCodes: string[] = []) {
  return {
    id: 1,
    pins: pinnedCodes.map((code, i) => ({ series_code: code, order: i })),
    card_transforms: [],
    recents: [],
    updated_at: '2026-05-11T00:00:00Z',
  }
}

/** Default loaded state — no pins, no loading */
function setupDefaults(pinnedCodes: string[] = []) {
  mockUseSeries.mockReturnValue({
    data: { items: ALL_SERIES, total: ALL_SERIES.length },
    isLoading: false,
    isError: false,
    isPending: false,
    isSuccess: true,
    error: null,
  } as ReturnType<typeof useSeries>)

  mockUseUserPrefs.mockReturnValue({
    data: makePrefs(pinnedCodes),
    isLoading: false,
    isError: false,
    isPending: false,
    isSuccess: true,
    error: null,
  } as ReturnType<typeof useUserPrefs>)

  mockUsePin.mockReturnValue(defaultPinMock as ReturnType<typeof usePin>)

  // Default: empty observations for all cards (no sparkline)
  mockUseObservations.mockReturnValue(emptyObsMock as ReturnType<typeof useObservations>)
}

/** Render Indices inside a MemoryRouter (required by useNavigate) */
function renderIndices() {
  return render(
    <MemoryRouter>
      <Indices />
    </MemoryRouter>,
  )
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
})

describe('Índices page — rendering', () => {
  it('renders the greeting heading', () => {
    setupDefaults()
    renderIndices()
    expect(screen.getByTestId('indices-greeting')).toBeInTheDocument()
    expect(screen.getByTestId('indices-greeting').textContent?.trim()).toBe('índices')
  })

  it('renders the subtitle hint text', () => {
    setupDefaults()
    renderIndices()
    expect(screen.getByText(/use a estrela para adicionar ao painel/i)).toBeInTheDocument()
  })

  it('renders the search input', () => {
    setupDefaults()
    renderIndices()
    expect(screen.getByRole('searchbox')).toBeInTheDocument()
  })

  it('renders the category toggle', () => {
    setupDefaults()
    renderIndices()
    expect(screen.getByTestId('category-toggle')).toBeInTheDocument()
  })

  it('renders a card for each unpinned series', () => {
    setupDefaults()
    renderIndices()
    const cards = screen.getAllByTestId('card')
    expect(cards).toHaveLength(ALL_SERIES.length)
  })
})

describe('Índices page — loading state', () => {
  it('shows skeleton grid while series are loading', () => {
    mockUseSeries.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      isPending: true,
      isSuccess: false,
      error: null,
    } as ReturnType<typeof useSeries>)
    mockUseUserPrefs.mockReturnValue({
      data: makePrefs(),
      isLoading: false,
      isError: false,
      isPending: false,
      isSuccess: true,
      error: null,
    } as ReturnType<typeof useUserPrefs>)
    mockUsePin.mockReturnValue(defaultPinMock as ReturnType<typeof usePin>)
    mockUseObservations.mockReturnValue(emptyObsMock as ReturnType<typeof useObservations>)

    renderIndices()
    expect(screen.getByTestId('skeleton-grid')).toBeInTheDocument()
  })

  it('shows skeleton grid while prefs are loading', () => {
    mockUseSeries.mockReturnValue({
      data: { items: ALL_SERIES, total: ALL_SERIES.length },
      isLoading: false,
      isError: false,
      isPending: false,
      isSuccess: true,
      error: null,
    } as ReturnType<typeof useSeries>)
    mockUseUserPrefs.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      isPending: true,
      isSuccess: false,
      error: null,
    } as ReturnType<typeof useUserPrefs>)
    mockUsePin.mockReturnValue(defaultPinMock as ReturnType<typeof usePin>)
    mockUseObservations.mockReturnValue(emptyObsMock as ReturnType<typeof useObservations>)

    renderIndices()
    expect(screen.getByTestId('skeleton-grid')).toBeInTheDocument()
  })
})

describe('Índices page — search filter (doc §4.2)', () => {
  it('filters by code substring (case-insensitive)', async () => {
    setupDefaults()
    renderIndices()

    const user = userEvent.setup()
    await user.type(screen.getByRole('searchbox'), 'ipca')

    const cards = screen.getAllByTestId('card')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toHaveAttribute('data-code', 'IPCA')
  })

  it('filters by uppercase code', async () => {
    setupDefaults()
    renderIndices()

    const user = userEvent.setup()
    await user.type(screen.getByRole('searchbox'), 'SELIC')

    const cards = screen.getAllByTestId('card')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toHaveAttribute('data-code', 'SELIC')
  })

  it('filters by name substring (case-insensitive)', async () => {
    setupDefaults()
    renderIndices()

    const user = userEvent.setup()
    await user.type(screen.getByRole('searchbox'), 'câmbio')

    const cards = screen.getAllByTestId('card')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toHaveAttribute('data-code', 'PTAX_USD')
  })

  it('filters by partial name match', async () => {
    setupDefaults()
    renderIndices()

    const user = userEvent.setup()
    // "Juros" series: SELIC + CDI both have "Juros" in category, not name
    // Let's search by a name fragment that matches multiple
    await user.type(screen.getByRole('searchbox'), 'taxa')

    // SELIC = "Taxa Selic" and PTAX_USD = "Taxa de Câmbio..."
    const cards = screen.getAllByTestId('card')
    expect(cards.length).toBeGreaterThanOrEqual(2)
    const codes = cards.map((c) => c.getAttribute('data-code'))
    expect(codes).toContain('SELIC')
    expect(codes).toContain('PTAX_USD')
  })

  it('shows all series when search is cleared', async () => {
    setupDefaults()
    renderIndices()

    const user = userEvent.setup()
    const input = screen.getByRole('searchbox')
    await user.type(input, 'ipca')
    expect(screen.getAllByTestId('card')).toHaveLength(1)

    await user.clear(input)
    expect(screen.getAllByTestId('card')).toHaveLength(ALL_SERIES.length)
  })
})

describe('Índices page — category filter (doc §4.3)', () => {
  it('filters to Juros cards when Juros chip selected', async () => {
    setupDefaults()
    renderIndices()

    const user = userEvent.setup()
    // Open toggle
    await user.click(screen.getByTestId('category-toggle-pill'))
    // Click Juros chip
    await user.click(screen.getByTestId('category-chip-Juros'))

    const cards = screen.getAllByTestId('card')
    const codes = cards.map((c) => c.getAttribute('data-code'))
    expect(codes).toContain('SELIC')
    expect(codes).toContain('CDI')
    expect(codes).not.toContain('IPCA')
    expect(codes).not.toContain('PTAX_USD')
  })

  it('shows all cards after selecting Todos', async () => {
    setupDefaults()
    renderIndices()

    const user = userEvent.setup()
    // Select Inflação first
    await user.click(screen.getByTestId('category-toggle-pill'))
    await user.click(screen.getByTestId('category-chip-Inflação'))
    // Then select Todos
    await user.click(screen.getByTestId('category-toggle-pill'))
    await user.click(screen.getByTestId('category-chip-Todos'))

    expect(screen.getAllByTestId('card')).toHaveLength(ALL_SERIES.length)
  })

  it('combines category filter with search', async () => {
    setupDefaults()
    renderIndices()

    const user = userEvent.setup()
    // Filter to Juros category
    await user.click(screen.getByTestId('category-toggle-pill'))
    await user.click(screen.getByTestId('category-chip-Juros'))
    // Now search for "cdi"
    await user.type(screen.getByRole('searchbox'), 'cdi')

    const cards = screen.getAllByTestId('card')
    expect(cards).toHaveLength(1)
    expect(cards[0]).toHaveAttribute('data-code', 'CDI')
  })
})

describe('Índices page — pin behavior (FR-4.1, AC-2)', () => {
  it('pinned series do NOT appear in catalog', () => {
    // IPCA is pinned
    setupDefaults(['IPCA'])
    renderIndices()

    const codes = screen.getAllByTestId('card').map((c) => c.getAttribute('data-code'))
    expect(codes).not.toContain('IPCA')
    expect(codes).toContain('SELIC')
  })

  it('multiple pinned series all absent from catalog', () => {
    setupDefaults(['IPCA', 'SELIC'])
    renderIndices()

    const codes = screen.getAllByTestId('card').map((c) => c.getAttribute('data-code'))
    expect(codes).not.toContain('IPCA')
    expect(codes).not.toContain('SELIC')
    expect(codes).toContain('CDI')
    expect(codes).toContain('PTAX_USD')
  })

  it('clicking star calls pin() with the correct series code', async () => {
    setupDefaults()
    const pinFn = vi.fn()
    mockUsePin.mockReturnValue({
      ...defaultPinMock,
      pin: pinFn,
    } as ReturnType<typeof usePin>)

    renderIndices()

    const user = userEvent.setup()
    // Find the IPCA card by data-code attribute and click its pin button
    const ipcaCard = screen.getAllByTestId('card').find(c => c.getAttribute('data-code') === 'IPCA')!
    const pinBtn = within(ipcaCard).getByTestId('card-pin-btn')
    await user.click(pinBtn)

    expect(pinFn).toHaveBeenCalledWith('IPCA')
  })

  it('pin button is not called for other series when clicking SELIC star', async () => {
    setupDefaults()
    const pinFn = vi.fn()
    mockUsePin.mockReturnValue({
      ...defaultPinMock,
      pin: pinFn,
    } as ReturnType<typeof usePin>)

    renderIndices()

    const user = userEvent.setup()
    const selicCard = screen.getAllByTestId('card').find(c => c.getAttribute('data-code') === 'SELIC')!
    const pinBtn = within(selicCard).getByTestId('card-pin-btn')
    await user.click(pinBtn)

    expect(pinFn).toHaveBeenCalledWith('SELIC')
    expect(pinFn).toHaveBeenCalledTimes(1)
  })
})

describe('Índices page — empty states (doc §4.5)', () => {
  it('shows all-pinned empty state when no unpinned series remain', () => {
    // Pin all 4 series in our test set
    setupDefaults(ALL_SERIES.map((s) => s.code))
    renderIndices()

    expect(screen.getByTestId('indices-all-pinned')).toBeInTheDocument()
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    expect(screen.getByTestId('empty-state').textContent).toContain(
      'Todos os índices estão fixados no Painel',
    )
  })

  it('does not show all-pinned state when search is active', async () => {
    // No series pinned, but search term returns no results
    setupDefaults()
    renderIndices()

    const user = userEvent.setup()
    await user.type(screen.getByRole('searchbox'), 'xyzxyzxyz')

    // Should show no-results, not all-pinned
    expect(screen.queryByTestId('indices-all-pinned')).not.toBeInTheDocument()
    expect(screen.getByTestId('indices-no-results')).toBeInTheDocument()
  })

  it('shows no-results empty state when search matches nothing', async () => {
    setupDefaults()
    renderIndices()

    const user = userEvent.setup()
    await user.type(screen.getByRole('searchbox'), 'xyzxyzxyz_nonexistent')

    expect(screen.getByTestId('indices-no-results')).toBeInTheDocument()
    expect(screen.queryByTestId('indices-grid')).not.toBeInTheDocument()
  })

  it('shows no-results state when category has no matching series', async () => {
    // Only Inflação, Juros, Câmbio series are in our mock — no Fiscal
    setupDefaults()
    renderIndices()

    const user = userEvent.setup()
    await user.click(screen.getByTestId('category-toggle-pill'))
    await user.click(screen.getByTestId('category-chip-Fiscal'))

    expect(screen.getByTestId('indices-no-results')).toBeInTheDocument()
  })
})

describe('Índices page — sparkline and delta (doc §4.4)', () => {
  it('renders sparkline when observations have 2+ points', () => {
    setupDefaults()
    // Override observations for IPCA with 3 data points
    mockUseObservations.mockImplementation((params) => {
      if (params.code === 'IPCA') {
        return makeObsMock('IPCA', [4.5, 4.6, 4.83]) as ReturnType<typeof useObservations>
      }
      return emptyObsMock as ReturnType<typeof useObservations>
    })

    renderIndices()

    // Sparkline should be present inside IPCA card
    const ipcaCard = screen.getAllByTestId('card').find(c => c.getAttribute('data-code') === 'IPCA')!
    expect(within(ipcaCard).getByTestId('sparkline')).toBeInTheDocument()
  })

  it('renders DeltaBadge when 2+ observations available', () => {
    setupDefaults()
    mockUseObservations.mockImplementation((params) => {
      if (params.code === 'SELIC') {
        return makeObsMock('SELIC', [10.5, 10.75]) as ReturnType<typeof useObservations>
      }
      return emptyObsMock as ReturnType<typeof useObservations>
    })

    renderIndices()

    const selicCard = screen.getAllByTestId('card').find(c => c.getAttribute('data-code') === 'SELIC')!
    expect(within(selicCard).getByTestId('delta-badge')).toBeInTheDocument()
  })

  it('does not render sparkline when observations empty', () => {
    setupDefaults()
    // mockUseObservations already returns emptyObsMock by default
    renderIndices()

    const cards = screen.getAllByTestId('card')
    cards.forEach((card) => {
      expect(within(card).queryByTestId('sparkline')).not.toBeInTheDocument()
    })
  })

  it('does not render DeltaBadge when observations empty', () => {
    setupDefaults()
    renderIndices()

    const cards = screen.getAllByTestId('card')
    cards.forEach((card) => {
      expect(within(card).queryByTestId('delta-badge')).not.toBeInTheDocument()
    })
  })
})

describe('Índices page — card click opens AnalysisPanel', () => {
  it('opens AnalysisPanel when card body is clicked', async () => {
    setupDefaults()
    renderIndices()

    const user = userEvent.setup()
    const ipcaCard = screen.getAllByTestId('card').find(c => c.getAttribute('data-code') === 'IPCA')!
    await user.click(ipcaCard)

    expect(screen.getByTestId('analysis-panel')).toBeInTheDocument()
    expect(screen.getByTestId('analysis-panel')).toHaveAttribute('data-code', 'IPCA')
  })

  it('does NOT open AnalysisPanel when pin button is clicked (stopPropagation)', async () => {
    setupDefaults()
    renderIndices()

    const user = userEvent.setup()
    const ipcaCard = screen.getAllByTestId('card').find(c => c.getAttribute('data-code') === 'IPCA')!
    const pinBtn = within(ipcaCard).getByTestId('card-pin-btn')
    await user.click(pinBtn)

    expect(screen.queryByTestId('analysis-panel')).not.toBeInTheDocument()
  })
})

describe('Índices page — count badge', () => {
  it('shows count of visible series', () => {
    setupDefaults()
    renderIndices()
    expect(screen.getByTestId('indices-count').textContent).toContain(`${ALL_SERIES.length} índices`)
  })

  it('shows singular "índice" when only 1 result', async () => {
    setupDefaults()
    renderIndices()

    const user = userEvent.setup()
    await user.type(screen.getByRole('searchbox'), 'ipca')

    expect(screen.getByTestId('indices-count').textContent).toBe('1 índice')
  })

  it('count updates after search', async () => {
    setupDefaults()
    renderIndices()

    const user = userEvent.setup()
    await user.type(screen.getByRole('searchbox'), 'taxa')

    const count = parseInt(screen.getByTestId('indices-count').textContent ?? '0', 10)
    // "Taxa Selic" and "Taxa de Câmbio PTAX USD" → 2
    expect(count).toBe(2)
  })
})

describe('Índices page — grouped by source (requirement: filter != Todos)', () => {
  it('renders a flat grid (no source headings) when filter is Todos', () => {
    setupDefaults()
    renderIndices()

    // "Todos" is the default — source group headings must NOT be present
    expect(screen.queryByTestId('source-group-BCB SGS')).not.toBeInTheDocument()
    expect(screen.queryByTestId('source-group-IBGE SIDRA')).not.toBeInTheDocument()
  })

  it('renders source group headings when a category filter is active', async () => {
    setupDefaults()
    renderIndices()

    const user = userEvent.setup()
    await user.click(screen.getByTestId('category-toggle-pill'))
    await user.click(screen.getByTestId('category-chip-Juros'))

    // All test series are sourced from BCB SGS — expect that group heading
    expect(screen.getByTestId('source-group-BCB SGS')).toBeInTheDocument()
  })

  it('cards remain accessible by data-code inside grouped view', async () => {
    setupDefaults()
    renderIndices()

    const user = userEvent.setup()
    await user.click(screen.getByTestId('category-toggle-pill'))
    await user.click(screen.getByTestId('category-chip-Juros'))

    const codes = screen.getAllByTestId('card').map((c) => c.getAttribute('data-code'))
    expect(codes).toContain('SELIC')
    expect(codes).toContain('CDI')
  })

  it('returns to flat grid when Todos is re-selected after a category filter', async () => {
    setupDefaults()
    renderIndices()

    const user = userEvent.setup()
    // Select Juros
    await user.click(screen.getByTestId('category-toggle-pill'))
    await user.click(screen.getByTestId('category-chip-Juros'))
    expect(screen.getByTestId('source-group-BCB SGS')).toBeInTheDocument()

    // Re-select Todos
    await user.click(screen.getByTestId('category-toggle-pill'))
    await user.click(screen.getByTestId('category-chip-Todos'))

    expect(screen.queryByTestId('source-group-BCB SGS')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('card')).toHaveLength(ALL_SERIES.length)
  })

  it('groups cards with multi-source data by source label', async () => {
    // Override ALL_SERIES to include an IBGE SIDRA source
    const SERIES_IBGE = {
      ...makeSeries({ code: 'PROD_IND', name: 'Produção Industrial', category: 'Atividade' }),
      source: 'IBGE SIDRA',
    }
    const SERIES_BCB = {
      ...makeSeries({ code: 'IPCA', name: 'Índice Nacional de Preços ao Consumidor Amplo', category: 'Atividade' }),
      source: 'BCB SGS',
    }

    mockUseSeries.mockReturnValue({
      data: { items: [SERIES_IBGE, SERIES_BCB], total: 2 },
      isLoading: false,
      isError: false,
      isPending: false,
      isSuccess: true,
      error: null,
    } as ReturnType<typeof useSeries>)
    mockUseUserPrefs.mockReturnValue({
      data: makePrefs(),
      isLoading: false,
      isError: false,
      isPending: false,
      isSuccess: true,
      error: null,
    } as ReturnType<typeof useUserPrefs>)
    mockUsePin.mockReturnValue(defaultPinMock as ReturnType<typeof usePin>)
    mockUseObservations.mockReturnValue(emptyObsMock as ReturnType<typeof useObservations>)

    renderIndices()

    const user = userEvent.setup()
    await user.click(screen.getByTestId('category-toggle-pill'))
    await user.click(screen.getByTestId('category-chip-Atividade'))

    // Both source groups should be present
    expect(screen.getByTestId('source-group-BCB SGS')).toBeInTheDocument()
    expect(screen.getByTestId('source-group-IBGE SIDRA')).toBeInTheDocument()

    // Cards are still reachable
    const codes = screen.getAllByTestId('card').map((c) => c.getAttribute('data-code'))
    expect(codes).toContain('PROD_IND')
    expect(codes).toContain('IPCA')
  })
})
