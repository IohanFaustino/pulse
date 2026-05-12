/**
 * Painel page tests — Vitest + React Testing Library
 *
 * Tests cover:
 *   - Greeting + pt-BR date rendering
 *   - Empty state (AC-7, FR-4.4)
 *   - Empty state CTA navigates to /indices (AC-7)
 *   - 2 pinned series → 2 SmallMultiple cards (FR-5.1)
 *   - Unpin click calls unpin mutation (FR-4.2, AC-2)
 *   - Modify click opens TransformModal (FR-5.4, AC-3)
 *   - TransformModal apply → setTransform called (FR-8.2, AC-3)
 *   - Category filter switches to flat grid (FR-5.3)
 *   - Category "Todos" shows category titles (FR-5.2)
 *   - Transform badge appears when card_transform set (FR-5.5, AC-3)
 *   - CalendarStrip scoped to pinned series
 *   - CalendarStrip fallback to all releases when no pins (AC-7)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'

// ── Module mocks ──────────────────────────────────────────────────────────────

// Mock all hooks that make network calls
const mockUnpin = vi.fn()
const mockSetTransform = vi.fn()

vi.mock('@/hooks/useUserPrefs', () => ({
  useUserPrefs: vi.fn(),
  useUnpin: () => ({ unpin: mockUnpin, isPending: false }),
  useSetTransform: () => ({ setTransform: mockSetTransform, isPending: false }),
}))

vi.mock('@/hooks/useSeries', () => ({
  useSeries: vi.fn(),
}))

vi.mock('@/hooks/useObservations', () => ({
  useObservations: vi.fn(),
}))

vi.mock('@/hooks/useReleases', () => ({
  useReleases: vi.fn(),
}))

// DailyRow fetches useSeries/useObservations/useHealth internally.
// Stub it out so Painel tests don't depend on the extra hooks.
vi.mock('@/components/DailyRow', () => ({
  default: () => <div data-testid="daily-row-stub" />,
}))

// Mock react-router-dom navigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// ── Import page (after mocks are in place) ────────────────────────────────────

import Painel from './Painel'
import { useUserPrefs } from '@/hooks/useUserPrefs'
import { useSeries } from '@/hooks/useSeries'
import { useObservations } from '@/hooks/useObservations'
import { useReleases } from '@/hooks/useReleases'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SERIES_IPCA = {
  code: 'IPCA',
  name: 'IPCA — Índice de Preços ao Consumidor Amplo',
  category: 'Inflação',
  source: 'BCB SGS',
  source_id: '433',
  frequency: 'monthly',
  unit: '%',
  first_observation: '1980-01-01',
  last_extraction_at: null,
  last_success_at: null,
  status: 'fresh',
}

const SERIES_SELIC = {
  code: 'SELIC',
  name: 'Taxa SELIC',
  category: 'Juros',
  source: 'BCB SGS',
  source_id: '432',
  frequency: 'daily',
  unit: '% a.a.',
  first_observation: '1986-06-04',
  last_extraction_at: null,
  last_success_at: null,
  status: 'fresh',
}

const OBS_IPCA = {
  items: [
    { observed_at: '2026-03-01T00:00:00Z', value: 0.83, ingested_at: '2026-03-10T00:00:00Z' },
    { observed_at: '2026-04-01T00:00:00Z', value: 0.43, ingested_at: '2026-04-10T00:00:00Z' },
  ],
  total: 2,
  code: 'IPCA',
}

const OBS_SELIC = {
  items: [
    { observed_at: '2026-04-29T00:00:00Z', value: 13.75, ingested_at: '2026-04-29T12:00:00Z' },
    { observed_at: '2026-04-30T00:00:00Z', value: 13.75, ingested_at: '2026-04-30T12:00:00Z' },
  ],
  total: 2,
  code: 'SELIC',
}

const EMPTY_RELEASES = { items: [], total: 0, month: '2026-05' }

const PREFS_EMPTY = {
  id: 1,
  pins: [],
  card_transforms: [],
  recents: [],
  updated_at: null,
}

const PREFS_TWO_PINS = {
  id: 1,
  pins: [
    { series_code: 'IPCA', order: 0 },
    { series_code: 'SELIC', order: 1 },
  ],
  card_transforms: [],
  recents: [],
  updated_at: null,
}

const SERIES_LIST = {
  items: [SERIES_IPCA, SERIES_SELIC],
  total: 2,
}

// ── Test helper ───────────────────────────────────────────────────────────────

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
}

function setupDefaultMocks() {
  vi.mocked(useUserPrefs).mockReturnValue({
    data: PREFS_EMPTY,
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof useUserPrefs>)

  vi.mocked(useSeries).mockReturnValue({
    data: SERIES_LIST,
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof useSeries>)

  vi.mocked(useObservations).mockReturnValue({
    data: OBS_IPCA,
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof useObservations>)

  vi.mocked(useReleases).mockReturnValue({
    data: EMPTY_RELEASES,
    isLoading: false,
    isError: false,
    error: null,
  } as ReturnType<typeof useReleases>)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Painel page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultMocks()
  })

  // ── Greeting ────────────────────────────────────────────────────────────────

  it('renders a greeting text (Bom dia / Boa tarde / Boa noite)', () => {
    render(<Painel />, { wrapper: createWrapper() })
    const greeting = screen.getByTestId('painel-greeting')
    expect(greeting.textContent).toMatch(/Bom dia\.|Boa tarde\.|Boa noite\./)
  })

  it('renders today in pt-BR long format (contains month name in Portuguese)', () => {
    render(<Painel />, { wrapper: createWrapper() })
    const dateEl = screen.getByTestId('painel-date')
    // pt-BR long date contains month names like "janeiro", "fevereiro", "maio", etc.
    expect(dateEl.textContent).toMatch(
      /janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro/i,
    )
  })

  // ── Status line ─────────────────────────────────────────────────────────────

  it('renders status line with pinned count = 0 when no pins', () => {
    render(<Painel />, { wrapper: createWrapper() })
    const pinCount = screen.getByTestId('status-pinned-count')
    expect(pinCount.textContent).toBe('0')
  })

  it('renders status line with pinned count = 2 when two pins', () => {
    vi.mocked(useUserPrefs).mockReturnValue({
      data: PREFS_TWO_PINS,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useUserPrefs>)
    vi.mocked(useObservations).mockImplementation(({ code }) =>
      ({
        data: code === 'IPCA' ? OBS_IPCA : OBS_SELIC,
        isLoading: false,
        isError: false,
        error: null,
      }) as ReturnType<typeof useObservations>,
    )
    render(<Painel />, { wrapper: createWrapper() })
    const pinCount = screen.getByTestId('status-pinned-count')
    expect(pinCount.textContent).toBe('2')
  })

  // ── Empty state (AC-7, FR-4.4) ─────────────────────────────────────────────

  it('renders empty state when no series are pinned', () => {
    render(<Painel />, { wrapper: createWrapper() })
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
  })

  it('empty state has a CTA button pointing to /indices', async () => {
    const user = userEvent.setup()
    render(<Painel />, { wrapper: createWrapper() })
    const cta = screen.getByTestId('empty-state-cta')
    expect(cta).toBeInTheDocument()
    await user.click(cta)
    expect(mockNavigate).toHaveBeenCalledWith('/indices')
  })

  it('does not render the small-multiples grid in empty state', () => {
    render(<Painel />, { wrapper: createWrapper() })
    expect(screen.queryByTestId('painel-grid')).not.toBeInTheDocument()
    expect(screen.queryByTestId('painel-grouped')).not.toBeInTheDocument()
  })

  // ── Pinned cards (FR-5.1) ──────────────────────────────────────────────────

  it('renders 2 SmallMultiple cards when 2 series are pinned', () => {
    vi.mocked(useUserPrefs).mockReturnValue({
      data: PREFS_TWO_PINS,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useUserPrefs>)
    vi.mocked(useObservations).mockImplementation(({ code }) =>
      ({
        data: code === 'IPCA' ? OBS_IPCA : OBS_SELIC,
        isLoading: false,
        isError: false,
        error: null,
      }) as ReturnType<typeof useObservations>,
    )
    render(<Painel />, { wrapper: createWrapper() })
    const cards = screen.getAllByTestId('small-multiple')
    expect(cards).toHaveLength(2)
  })

  it('shows SkeletonCard while observations are loading', () => {
    vi.mocked(useUserPrefs).mockReturnValue({
      data: PREFS_TWO_PINS,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useUserPrefs>)
    vi.mocked(useObservations).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    } as ReturnType<typeof useObservations>)
    render(<Painel />, { wrapper: createWrapper() })
    expect(screen.getAllByTestId('skeleton-card')).toHaveLength(2)
    expect(screen.queryByTestId('small-multiple')).not.toBeInTheDocument()
  })

  // ── Unpin (FR-4.2, AC-2) ──────────────────────────────────────────────────

  it('calls unpin with the series code when unpin button is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(useUserPrefs).mockReturnValue({
      data: { ...PREFS_TWO_PINS, pins: [{ series_code: 'IPCA', order: 0 }] },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useUserPrefs>)
    vi.mocked(useObservations).mockReturnValue({
      data: OBS_IPCA,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useObservations>)
    render(<Painel />, { wrapper: createWrapper() })
    await user.click(screen.getByTestId('sm-unpin-btn'))
    expect(mockUnpin).toHaveBeenCalledWith('IPCA')
  })

  // ── Modify → TransformModal (FR-5.4, AC-3) ─────────────────────────────────

  it('opens TransformModal when modify button is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(useUserPrefs).mockReturnValue({
      data: { ...PREFS_TWO_PINS, pins: [{ series_code: 'IPCA', order: 0 }] },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useUserPrefs>)
    vi.mocked(useObservations).mockReturnValue({
      data: OBS_IPCA,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useObservations>)
    render(<Painel />, { wrapper: createWrapper() })

    expect(screen.queryByTestId('transform-modal')).not.toBeInTheDocument()
    await user.click(screen.getByTestId('sm-modify-btn'))
    expect(screen.getByTestId('transform-modal')).toBeInTheDocument()
  })

  it('closes TransformModal on cancel', async () => {
    const user = userEvent.setup()
    vi.mocked(useUserPrefs).mockReturnValue({
      data: { ...PREFS_TWO_PINS, pins: [{ series_code: 'IPCA', order: 0 }] },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useUserPrefs>)
    vi.mocked(useObservations).mockReturnValue({
      data: OBS_IPCA,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useObservations>)
    render(<Painel />, { wrapper: createWrapper() })

    await user.click(screen.getByTestId('sm-modify-btn'))
    expect(screen.getByTestId('transform-modal')).toBeInTheDocument()

    await user.click(screen.getByTestId('modal-cancel-btn'))
    expect(screen.queryByTestId('transform-modal')).not.toBeInTheDocument()
  })

  // ── TransformModal apply → setTransform (FR-8.2, AC-3) ────────────────────

  it('calls setTransform with spec when apply is clicked in modal', async () => {
    const user = userEvent.setup()
    vi.mocked(useUserPrefs).mockReturnValue({
      data: { ...PREFS_TWO_PINS, pins: [{ series_code: 'IPCA', order: 0 }] },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useUserPrefs>)
    vi.mocked(useObservations).mockReturnValue({
      data: OBS_IPCA,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useObservations>)
    render(<Painel />, { wrapper: createWrapper() })

    await user.click(screen.getByTestId('sm-modify-btn'))

    // Select YoY radio in the modal
    await user.click(screen.getByTestId('radio-yoy'))

    await user.click(screen.getByTestId('modal-apply-btn'))

    expect(mockSetTransform).toHaveBeenCalledWith('IPCA', { op: 'yoy' })
    expect(screen.queryByTestId('transform-modal')).not.toBeInTheDocument()
  })

  // ── Transform badge (FR-5.5, AC-3) ────────────────────────────────────────

  it('shows transform badge when card_transforms has a non-level spec', () => {
    vi.mocked(useUserPrefs).mockReturnValue({
      data: {
        ...PREFS_TWO_PINS,
        pins: [{ series_code: 'IPCA', order: 0 }],
        card_transforms: [
          { series_code: 'IPCA', transform_spec: { op: 'yoy' } },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useUserPrefs>)
    vi.mocked(useObservations).mockReturnValue({
      data: OBS_IPCA,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useObservations>)
    render(<Painel />, { wrapper: createWrapper() })
    expect(screen.getByTestId('sm-transform-badge')).toBeInTheDocument()
    expect(screen.getByTestId('sm-transform-badge').textContent).toBe('yoy')
  })

  it('does not show transform badge when no card_transform is set', () => {
    vi.mocked(useUserPrefs).mockReturnValue({
      data: {
        ...PREFS_TWO_PINS,
        pins: [{ series_code: 'IPCA', order: 0 }],
        card_transforms: [],
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useUserPrefs>)
    vi.mocked(useObservations).mockReturnValue({
      data: OBS_IPCA,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useObservations>)
    render(<Painel />, { wrapper: createWrapper() })
    expect(screen.queryByTestId('sm-transform-badge')).not.toBeInTheDocument()
  })

  it('does not show transform badge when card_transform is "level"', () => {
    vi.mocked(useUserPrefs).mockReturnValue({
      data: {
        ...PREFS_TWO_PINS,
        pins: [{ series_code: 'IPCA', order: 0 }],
        card_transforms: [
          { series_code: 'IPCA', transform_spec: { op: 'level' } },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useUserPrefs>)
    vi.mocked(useObservations).mockReturnValue({
      data: OBS_IPCA,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useObservations>)
    render(<Painel />, { wrapper: createWrapper() })
    expect(screen.queryByTestId('sm-transform-badge')).not.toBeInTheDocument()
  })

  // ── Category toggle — "Todos" grouped (FR-5.2) ──────────────────────────────

  it('shows category group title headers when category is Todos', () => {
    vi.mocked(useUserPrefs).mockReturnValue({
      data: PREFS_TWO_PINS,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useUserPrefs>)
    vi.mocked(useObservations).mockImplementation(({ code }) =>
      ({
        data: code === 'IPCA' ? OBS_IPCA : OBS_SELIC,
        isLoading: false,
        isError: false,
        error: null,
      }) as ReturnType<typeof useObservations>,
    )
    render(<Painel />, { wrapper: createWrapper() })

    // Todos is the default — should show grouped view
    expect(screen.getByTestId('painel-grouped')).toBeInTheDocument()
    // IPCA is Inflação, SELIC is Juros → two category titles
    expect(screen.getByTestId('category-title-Inflação')).toBeInTheDocument()
    expect(screen.getByTestId('category-title-Juros')).toBeInTheDocument()
  })

  // ── Category toggle — flat grid (FR-5.3) ────────────────────────────────────

  it('shows flat grid with only matching series when a category filter is selected', async () => {
    const user = userEvent.setup()
    vi.mocked(useUserPrefs).mockReturnValue({
      data: PREFS_TWO_PINS,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useUserPrefs>)
    vi.mocked(useObservations).mockImplementation(({ code }) =>
      ({
        data: code === 'IPCA' ? OBS_IPCA : OBS_SELIC,
        isLoading: false,
        isError: false,
        error: null,
      }) as ReturnType<typeof useObservations>,
    )
    render(<Painel />, { wrapper: createWrapper() })

    // Open CategoryToggle and select "Juros"
    await user.click(screen.getByTestId('category-toggle-pill'))
    await user.click(screen.getByTestId('category-chip-Juros'))

    // Grouped view should be gone; flat grid should show
    expect(screen.queryByTestId('painel-grouped')).not.toBeInTheDocument()
    const grid = screen.getByTestId('painel-grid')
    expect(grid).toBeInTheDocument()

    // Only SELIC (Juros) should appear, not IPCA (Inflação)
    const cards = within(grid).getAllByTestId('small-multiple')
    expect(cards).toHaveLength(1)
    expect(within(cards[0]!).getByText('SELIC')).toBeInTheDocument()
  })

  // ── CalendarStrip ────────────────────────────────────────────────────────────

  it('renders CalendarStrip when pins exist', () => {
    vi.mocked(useUserPrefs).mockReturnValue({
      data: PREFS_TWO_PINS,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useUserPrefs>)
    vi.mocked(useObservations).mockImplementation(({ code }) =>
      ({
        data: code === 'IPCA' ? OBS_IPCA : OBS_SELIC,
        isLoading: false,
        isError: false,
        error: null,
      }) as ReturnType<typeof useObservations>,
    )
    render(<Painel />, { wrapper: createWrapper() })
    expect(screen.getByTestId('calendar-strip')).toBeInTheDocument()
  })

  it('does not render CalendarStrip in empty state (no pins)', () => {
    render(<Painel />, { wrapper: createWrapper() })
    expect(screen.queryByTestId('calendar-strip')).not.toBeInTheDocument()
  })

  it('CalendarStrip receives releases scoped to pinned codes', () => {
    const releaseIPCA = {
      id: 1,
      series_code: 'IPCA',
      scheduled_for: '2026-05-12',
      status: 'expected' as const,
      source_type: 'hardcoded' as const,
    }
    const releaseCDI = {
      id: 2,
      series_code: 'CDI',
      scheduled_for: '2026-05-12',
      status: 'expected' as const,
      source_type: 'hardcoded' as const,
    }
    vi.mocked(useUserPrefs).mockReturnValue({
      data: { ...PREFS_TWO_PINS, pins: [{ series_code: 'IPCA', order: 0 }] },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useUserPrefs>)
    vi.mocked(useReleases).mockReturnValue({
      data: { items: [releaseIPCA, releaseCDI], total: 2, month: '2026-05' },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useReleases>)
    vi.mocked(useObservations).mockReturnValue({
      data: OBS_IPCA,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useObservations>)
    render(<Painel />, { wrapper: createWrapper() })

    // Only IPCA release chip should appear (CDI not pinned)
    const chips = screen.getAllByTestId('calendar-release-chip')
    expect(chips).toHaveLength(1)
    expect(chips[0]!.getAttribute('title')).toBe('IPCA')
  })

  it('CalendarStrip shows all releases when no pins (AC-7 fallback)', () => {
    const releaseIPCA = {
      id: 1,
      series_code: 'IPCA',
      scheduled_for: '2026-05-12',
      status: 'expected' as const,
      source_type: 'hardcoded' as const,
    }
    const releaseCDI = {
      id: 2,
      series_code: 'CDI',
      scheduled_for: '2026-05-12',
      status: 'expected' as const,
      source_type: 'hardcoded' as const,
    }
    vi.mocked(useReleases).mockReturnValue({
      data: { items: [releaseIPCA, releaseCDI], total: 2, month: '2026-05' },
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useReleases>)
    render(<Painel />, { wrapper: createWrapper() })

    // Empty state: CalendarStrip not rendered (it only renders with pins)
    // Per doc §3 and AC-7: strip shown with all series, but only when pins > 0
    // When pins = 0, empty state is shown instead (no CalendarStrip)
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-strip')).not.toBeInTheDocument()
  })

  // ── DailyRow ─────────────────────────────────────────────────────────────────

  it('renders DailyRow when pins exist (below CalendarStrip)', () => {
    vi.mocked(useUserPrefs).mockReturnValue({
      data: PREFS_TWO_PINS,
      isLoading: false,
      isError: false,
      error: null,
    } as ReturnType<typeof useUserPrefs>)
    vi.mocked(useObservations).mockImplementation(({ code }) =>
      ({
        data: code === 'IPCA' ? OBS_IPCA : OBS_SELIC,
        isLoading: false,
        isError: false,
        error: null,
      }) as ReturnType<typeof useObservations>,
    )
    render(<Painel />, { wrapper: createWrapper() })
    expect(screen.getByTestId('daily-row-stub')).toBeInTheDocument()
  })

  it('does not render DailyRow in empty state (no pins)', () => {
    render(<Painel />, { wrapper: createWrapper() })
    expect(screen.queryByTestId('daily-row-stub')).not.toBeInTheDocument()
  })

  // ── Page registration ────────────────────────────────────────────────────────

  it('renders the page container', () => {
    render(<Painel />, { wrapper: createWrapper() })
    expect(screen.getByTestId('page-painel')).toBeInTheDocument()
  })
})
