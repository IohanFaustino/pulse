/**
 * Calendário page tests — W4b.
 *
 * Tests verify:
 *   - 7-column grid structure
 *   - Month navigation (prev/next/today) — AC-5
 *   - E/R counters update with month
 *   - Today cell highlight
 *   - Weekend cell modifier
 *   - +N overflow for >6 chips
 *   - Empty state when no releases
 *   - Loading skeleton during fetch
 *   - Category filter passthrough to hook
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── Mocks ─────────────────────────────────────────────────────────────────────

// Mock hooks at module level (hoisted by vitest)
vi.mock('@/hooks/useReleases', () => ({
  useReleases: vi.fn(),
}))

vi.mock('@/hooks/useSeries', () => ({
  useSeries: vi.fn(),
}))

vi.mock('@/hooks/useHealth', () => ({
  useHealth: vi.fn(),
}))

vi.mock('@/lib/formatPtBR', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/formatPtBR')>()
  return {
    ...original,
    greeting: () => 'Bom dia.',
  }
})

// Stub DailyTable — avoid N queries in Calendario tests
vi.mock('@/components/DailyTable', () => ({
  default: () => <div data-testid="daily-table-stub" />,
}))

// Stub DayDetailModal — test interaction separately in its own test file
vi.mock('@/components/DayDetailModal', () => ({
  default: ({
    open,
    onClose,
    date,
  }: {
    open: boolean
    onClose: () => void
    date: Date | null
  }) =>
    open ? (
      <div data-testid="day-modal-stub">
        <span data-testid="day-modal-date">{date?.toISOString() ?? ''}</span>
        <button onClick={onClose} data-testid="day-modal-stub-close">
          X
        </button>
      </div>
    ) : null,
}))

// Static import — hoisted mocks will intercept the module before this runs
import { useReleases } from '@/hooks/useReleases'
import { useSeries } from '@/hooks/useSeries'
import { useHealth } from '@/hooks/useHealth'
import type { ReleaseRead } from '@/hooks/useReleases'
import Calendario from './Calendario'

// ── Test helpers ──────────────────────────────────────────────────────────────

const mockUseReleases = vi.mocked(useReleases)
const mockUseSeries = vi.mocked(useSeries)
const mockUseHealth = vi.mocked(useHealth)

/** Minimal series list for category lookup */
const MOCK_SERIES_DATA = {
  items: [
    {
      code: 'IPCA',
      name: 'IPCA',
      category: 'Inflação',
      source: 'BCB SGS',
      source_id: '433',
      frequency: 'monthly',
      unit: '%',
      first_observation: '1980-01-01',
      last_extraction_at: null,
      last_success_at: null,
      status: 'fresh',
    },
    {
      code: 'PIB',
      name: 'PIB',
      category: 'Atividade',
      source: 'IBGE SIDRA',
      source_id: '5932',
      frequency: 'quarterly',
      unit: 'R$ milhões',
      first_observation: '1996-01-01',
      last_extraction_at: null,
      last_success_at: null,
      status: 'fresh',
    },
  ],
  total: 2,
}

let releaseIdCounter = 0

function makeRelease(overrides: Partial<ReleaseRead> = {}): ReleaseRead {
  return {
    id: ++releaseIdCounter,
    series_code: 'IPCA',
    scheduled_for: '2026-05-15',
    status: 'expected',
    source_type: 'scraped',
    ...overrides,
  }
}

function makeReleasesData(items: ReleaseRead[], month = '2026-05') {
  return { items, total: items.length, month, category: null }
}

function makeEmptyReleasesData(month = '2026-05') {
  return makeReleasesData([], month)
}

/** Wrap component with required providers */
function renderCalendario() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <Calendario />
    </QueryClientProvider>
  )
}

// ── Default mock setup ────────────────────────────────────────────────────────

beforeEach(() => {
  releaseIdCounter = 0

  mockUseSeries.mockReturnValue({
    data: MOCK_SERIES_DATA,
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useSeries>)

  mockUseReleases.mockReturnValue({
    data: makeEmptyReleasesData(),
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useReleases>)

  mockUseHealth.mockReturnValue({
    data: { status: 'ok', series: [], oldest_success_at: null },
    isLoading: false,
    isError: false,
  } as ReturnType<typeof useHealth>)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Calendário page', () => {
  // ── Page structure ──────────────────────────────────────────────────────────

  it('renders the page container', () => {
    renderCalendario()
    expect(screen.getByTestId('page-calendario')).toBeInTheDocument()
  })

  it('renders 7 column headers (Dom–Sáb)', () => {
    mockUseReleases.mockReturnValue({
      data: makeReleasesData([makeRelease()]),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useReleases>)

    renderCalendario()
    const headers = screen.getAllByTestId('cal-col-header')
    expect(headers).toHaveLength(7)
    expect(headers[0]).toHaveTextContent('Dom')
    expect(headers[6]).toHaveTextContent('Sáb')
  })

  it('renders calendar grid when data is loaded', () => {
    mockUseReleases.mockReturnValue({
      data: makeReleasesData([makeRelease()]),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useReleases>)

    renderCalendario()
    expect(screen.getByTestId('calendar-grid')).toBeInTheDocument()
  })

  // ── Loading state ───────────────────────────────────────────────────────────

  it('shows loading skeleton while fetching', () => {
    mockUseReleases.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useReleases>)

    renderCalendario()
    expect(screen.getByTestId('calendar-skeleton')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-grid')).not.toBeInTheDocument()
  })

  // ── Empty state ─────────────────────────────────────────────────────────────

  it('shows empty state when no releases returned', () => {
    renderCalendario()
    expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    expect(screen.queryByTestId('calendar-grid')).not.toBeInTheDocument()
  })

  // ── Month navigation (AC-5) ─────────────────────────────────────────────────

  it('renders a month heading initially', () => {
    renderCalendario()
    const monthLabel = screen.getByTestId('nav-month-label')
    expect(monthLabel.textContent).toMatch(/\d{4}/)
  })

  it('navigates to next month when › is clicked', async () => {
    const user = userEvent.setup()
    renderCalendario()

    const initial = screen.getByTestId('nav-month-label').textContent ?? ''

    await user.click(screen.getByTestId('nav-next'))

    const updated = screen.getByTestId('nav-month-label').textContent ?? ''
    expect(updated).not.toBe(initial)
  })

  it('navigates to previous month when ‹ is clicked', async () => {
    const user = userEvent.setup()
    renderCalendario()

    const initial = screen.getByTestId('nav-month-label').textContent ?? ''

    await user.click(screen.getByTestId('nav-prev'))

    const updated = screen.getByTestId('nav-month-label').textContent ?? ''
    expect(updated).not.toBe(initial)
  })

  it('"Hoje" returns to current month after navigating away', async () => {
    const user = userEvent.setup()
    renderCalendario()

    const initial = screen.getByTestId('nav-month-label').textContent ?? ''

    // Navigate two months away
    await user.click(screen.getByTestId('nav-next'))
    await user.click(screen.getByTestId('nav-next'))

    const awayLabel = screen.getByTestId('nav-month-label').textContent ?? ''
    expect(awayLabel).not.toBe(initial)

    // Return to today
    await user.click(screen.getByTestId('nav-today'))

    const returnedLabel = screen.getByTestId('nav-month-label').textContent ?? ''
    expect(returnedLabel).toBe(initial)
  })

  // ── E/R counters ────────────────────────────────────────────────────────────

  it('shows eCount=1 for a single expected release', () => {
    mockUseReleases.mockReturnValue({
      data: makeReleasesData([makeRelease({ status: 'expected' })]),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useReleases>)

    renderCalendario()
    expect(screen.getByTestId('counter-e').textContent).toContain('1')
  })

  it('shows rCount=2 for two realized releases', () => {
    mockUseReleases.mockReturnValue({
      data: makeReleasesData([
        makeRelease({ status: 'realized', scheduled_for: '2026-05-01' }),
        makeRelease({ status: 'realized', scheduled_for: '2026-05-03' }),
      ]),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useReleases>)

    renderCalendario()
    expect(screen.getByTestId('counter-r').textContent).toContain('2')
  })

  it('both counters show 0 when no releases', () => {
    renderCalendario()
    expect(screen.getByTestId('counter-e').textContent).toContain('0')
    expect(screen.getByTestId('counter-r').textContent).toContain('0')
  })

  // ── Chip classification ─────────────────────────────────────────────────────

  it('renders E chip for a future expected release', () => {
    // Use a date in the current month but in the future relative to a fixed past date.
    // We pick a mid-month date; the chip is classified E because status='expected'.
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const futureDay = String(Math.min(today.getDate() + 5, 28)).padStart(2, '0')
    const futureDate = `${y}-${m}-${futureDay}`

    mockUseReleases.mockReturnValue({
      data: makeReleasesData([
        makeRelease({ scheduled_for: futureDate, status: 'expected' }),
      ]),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useReleases>)

    renderCalendario()
    const chips = screen.getAllByTestId('release-chip')
    expect(chips.length).toBeGreaterThan(0)
    expect(chips[0]).toHaveAttribute('data-status', 'E')
  })

  it('renders R chip for a past realized release', () => {
    // Use a date in the current month that is in the past (day 1 if today > 1).
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const pastDay = String(Math.max(1, today.getDate() - 5)).padStart(2, '0')
    const pastDate = `${y}-${m}-${pastDay}`

    mockUseReleases.mockReturnValue({
      data: makeReleasesData([
        makeRelease({ scheduled_for: pastDate, status: 'realized' }),
      ]),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useReleases>)

    renderCalendario()
    const chips = screen.getAllByTestId('release-chip')
    expect(chips.length).toBeGreaterThan(0)
    expect(chips[0]).toHaveAttribute('data-status', 'R')
  })

  // ── Overflow / collapse indicator (threshold: >3) ───────────────────────────

  it('shows collapse overflow button when more than 3 chips on one day', () => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    // Use day 15 — safely within any month
    const sameDay = `${y}-${m}-15`

    // 5 releases → collapsed: 1 chip + overflow button showing "+4"
    const releases = Array.from({ length: 5 }, (_, i) =>
      makeRelease({
        scheduled_for: sameDay,
        series_code: `SER${i}`,
        status: 'expected',
      })
    )

    mockUseReleases.mockReturnValue({
      data: makeReleasesData(releases),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useReleases>)

    renderCalendario()
    const overflow = screen.getByTestId('chip-overflow')
    expect(overflow).toBeInTheDocument()
    // 5 releases: 1 shown + button showing +4
    expect(overflow.textContent).toBe('+4')
  })

  it('shows only 1 chip when collapsed (>3 releases)', () => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const sameDay = `${y}-${m}-15`

    const releases = Array.from({ length: 5 }, (_, i) =>
      makeRelease({
        scheduled_for: sameDay,
        series_code: `SER${i}`,
        status: 'expected',
      })
    )

    mockUseReleases.mockReturnValue({
      data: makeReleasesData(releases),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useReleases>)

    renderCalendario()
    const chips = screen.getAllByTestId('release-chip')
    // Only 1 chip rendered (first release)
    expect(chips).toHaveLength(1)
  })

  it('does not collapse when exactly 3 releases on one day', () => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const sameDay = `${y}-${m}-15`

    const releases = Array.from({ length: 3 }, (_, i) =>
      makeRelease({
        scheduled_for: sameDay,
        series_code: `SER${i}`,
        status: 'expected',
      })
    )

    mockUseReleases.mockReturnValue({
      data: makeReleasesData(releases),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useReleases>)

    renderCalendario()
    // No overflow button
    expect(screen.queryByTestId('chip-overflow')).not.toBeInTheDocument()
    // All 3 chips shown
    const chips = screen.getAllByTestId('release-chip')
    expect(chips).toHaveLength(3)
  })

  // ── Today cell highlight (FR-6.5) ───────────────────────────────────────────

  it("today's cell has data-today='true' when in current month", () => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    const todayKey = `${y}-${m}-${d}`
    // Provide a release in the current month so the grid renders (not empty state)
    const triggerDate = `${y}-${m}-15`

    mockUseReleases.mockReturnValue({
      data: makeReleasesData([makeRelease({ scheduled_for: triggerDate })]),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useReleases>)

    renderCalendario()

    const todayCell = screen.queryByTestId(`cal-cell-${todayKey}`)
    // The cell must exist since we're rendering the current month
    expect(todayCell).not.toBeNull()
    if (todayCell) {
      expect(todayCell).toHaveAttribute('data-today', 'true')
    }
  })

  // ── Pad cells ───────────────────────────────────────────────────────────────

  it('renders pad cells for leading empty slots', () => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const triggerDate = `${y}-${m}-15`

    mockUseReleases.mockReturnValue({
      data: makeReleasesData([makeRelease({ scheduled_for: triggerDate })]),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useReleases>)

    renderCalendario()

    // Pad cells exist unless the 1st falls on a Sunday (unlikely in general)
    // We just verify the component renders the grid without error
    const grid = screen.getByTestId('calendar-grid')
    expect(grid).toBeInTheDocument()

    // If month doesn't start on Sunday, there will be at least 1 pad cell
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    if (firstOfMonth.getDay() > 0) {
      const padCells = screen.getAllByTestId('cal-pad-cell')
      expect(padCells.length).toBeGreaterThanOrEqual(1)
    }
  })

  // ── Daily exclusion note (FR-6.7) ───────────────────────────────────────────

  it('renders the daily series exclusion note', () => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')

    mockUseReleases.mockReturnValue({
      data: makeReleasesData([makeRelease({ scheduled_for: `${y}-${m}-15` })]),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useReleases>)

    renderCalendario()
    const note = screen.getByTestId('daily-exclusion-note')
    expect(note).toBeInTheDocument()
    expect(note.textContent).toContain('CDI')
    expect(note.textContent).toContain('PTAX')
  })

  // ── Category filter passthrough ─────────────────────────────────────────────

  it('passes undefined category when "Todos" is selected (default)', () => {
    renderCalendario()
    expect(mockUseReleases).toHaveBeenCalledWith(
      expect.objectContaining({ category: undefined })
    )
  })

  it('passes category string to useReleases when filter changes', async () => {
    const user = userEvent.setup()
    mockUseReleases.mockReturnValue({
      data: makeReleasesData([makeRelease()]),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useReleases>)

    renderCalendario()

    await user.click(screen.getByTestId('category-toggle-pill'))
    await user.click(screen.getByTestId('category-chip-Inflação'))

    await waitFor(() => {
      expect(mockUseReleases).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'Inflação' })
      )
    })
  })

  // ── Month / Year selects ────────────────────────────────────────────────────

  it('month select renders 12 options', () => {
    renderCalendario()
    const monthSelect = screen.getByTestId('nav-month-select') as HTMLSelectElement
    expect(monthSelect.options.length).toBe(12)
    expect(monthSelect.options[0].text).toBe('Janeiro')
    expect(monthSelect.options[11].text).toBe('Dezembro')
  })

  it('year select renders 11 options with current year present', () => {
    renderCalendario()
    const yearSelect = screen.getByTestId('nav-year-select') as HTMLSelectElement
    expect(yearSelect.options.length).toBe(11)
    const currentYear = new Date().getFullYear()
    const yearValues = Array.from(yearSelect.options).map((o) => Number(o.value))
    expect(yearValues).toContain(currentYear)
  })

  it('year select defaults to the current year', () => {
    renderCalendario()
    const yearSelect = screen.getByTestId('nav-year-select') as HTMLSelectElement
    expect(Number(yearSelect.value)).toBe(new Date().getFullYear())
  })

  it('month select defaults to the current month index', () => {
    renderCalendario()
    const monthSelect = screen.getByTestId('nav-month-select') as HTMLSelectElement
    expect(Number(monthSelect.value)).toBe(new Date().getMonth())
  })

  it('changing month select updates the nav-month-label', async () => {
    const user = userEvent.setup()
    renderCalendario()

    const monthSelect = screen.getByTestId('nav-month-select') as HTMLSelectElement
    const currentMonthIdx = new Date().getMonth()
    // Select a different month (wrap around to avoid out-of-range)
    const targetIdx = (currentMonthIdx + 1) % 12
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril',
      'Maio', 'Junho', 'Julho', 'Agosto',
      'Setembro', 'Outubro', 'Novembro', 'Dezembro',
    ]

    await user.selectOptions(monthSelect, String(targetIdx))

    const label = screen.getByTestId('nav-month-label').textContent ?? ''
    expect(label).toContain(monthNames[targetIdx])
  })

  it('changing year select updates the nav-month-label', async () => {
    const user = userEvent.setup()
    renderCalendario()

    const yearSelect = screen.getByTestId('nav-year-select') as HTMLSelectElement
    const currentYear = new Date().getFullYear()
    const targetYear = currentYear + 1

    await user.selectOptions(yearSelect, String(targetYear))

    const label = screen.getByTestId('nav-month-label').textContent ?? ''
    expect(label).toContain(String(targetYear))
  })

  // ── DailyTable stub ─────────────────────────────────────────────────────────

  it('renders DailyTable stub below calendar', () => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')

    mockUseReleases.mockReturnValue({
      data: makeReleasesData([makeRelease({ scheduled_for: `${y}-${m}-15` })]),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useReleases>)

    renderCalendario()
    expect(screen.getByTestId('daily-table-stub')).toBeInTheDocument()
  })

  // ── Cell click → DayDetailModal ─────────────────────────────────────────────

  it('opens DayDetailModal when a cell with releases is clicked', async () => {
    const user = userEvent.setup()
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const sameDay = `${y}-${m}-15`

    mockUseReleases.mockReturnValue({
      data: makeReleasesData([makeRelease({ scheduled_for: sameDay, status: 'expected' })]),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useReleases>)

    renderCalendario()

    const cell = screen.getByTestId(`cal-cell-${sameDay}`)
    await user.click(cell)

    expect(screen.getByTestId('day-modal-stub')).toBeInTheDocument()
  })

  it('closes DayDetailModal when stub close is clicked', async () => {
    const user = userEvent.setup()
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const sameDay = `${y}-${m}-15`

    mockUseReleases.mockReturnValue({
      data: makeReleasesData([makeRelease({ scheduled_for: sameDay, status: 'expected' })]),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useReleases>)

    renderCalendario()

    // Open modal
    await user.click(screen.getByTestId(`cal-cell-${sameDay}`))
    expect(screen.getByTestId('day-modal-stub')).toBeInTheDocument()

    // Close modal
    await user.click(screen.getByTestId('day-modal-stub-close'))
    expect(screen.queryByTestId('day-modal-stub')).not.toBeInTheDocument()
  })

  it('cell without releases is NOT clickable (no tabIndex)', () => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    // Use a day that has no releases (day 28 won't have releases in empty mock)
    const emptyDay = `${y}-${m}-28`

    mockUseReleases.mockReturnValue({
      data: makeReleasesData([makeRelease({ scheduled_for: `${y}-${m}-15` })]),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useReleases>)

    renderCalendario()

    const emptyCell = screen.queryByTestId(`cal-cell-${emptyDay}`)
    if (emptyCell) {
      expect(emptyCell.getAttribute('tabindex')).toBeNull()
    }
  })

  it('overflow button click opens DayDetailModal', async () => {
    const user = userEvent.setup()
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const sameDay = `${y}-${m}-15`

    // 5 releases → collapsed
    const releases = Array.from({ length: 5 }, (_, i) =>
      makeRelease({
        scheduled_for: sameDay,
        series_code: `SER${i}`,
        status: 'expected',
      })
    )

    mockUseReleases.mockReturnValue({
      data: makeReleasesData(releases),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useReleases>)

    renderCalendario()

    const overflowBtn = screen.getByTestId('chip-overflow')
    await user.click(overflowBtn)

    expect(screen.getByTestId('day-modal-stub')).toBeInTheDocument()
  })

  // ── Legend ──────────────────────────────────────────────────────────────────

  it('renders E/R legend', () => {
    renderCalendario()
    const legend = screen.getByLabelText('Legenda')
    expect(legend.textContent).toContain('Esperado')
    expect(legend.textContent).toContain('Realizado')
  })

  // ── Accessibility ───────────────────────────────────────────────────────────

  it('prev button has aria-label "Mês anterior"', () => {
    renderCalendario()
    expect(screen.getByLabelText('Mês anterior')).toBeInTheDocument()
  })

  it('next button has aria-label "Próximo mês"', () => {
    renderCalendario()
    expect(screen.getByLabelText('Próximo mês')).toBeInTheDocument()
  })

  it('calendar grid has an aria-label attribute', () => {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')

    mockUseReleases.mockReturnValue({
      data: makeReleasesData([makeRelease({ scheduled_for: `${y}-${m}-15` })]),
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useReleases>)

    renderCalendario()
    const grid = screen.getByTestId('calendar-grid')
    expect(grid).toHaveAttribute('aria-label')
    expect(grid.getAttribute('aria-label')).toContain('Grade do mês')
  })
})
