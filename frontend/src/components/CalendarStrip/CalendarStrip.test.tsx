import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CalendarStrip from './index'
import type { components } from '@/api/schema'

type ReleaseRead = components['schemas']['ReleaseRead']

const mockReleases: ReleaseRead[] = [
  {
    id: 1,
    series_code: 'IPCA',
    scheduled_for: '2026-05-15',
    status: 'expected',
    source_type: 'hardcoded',
  },
  {
    id: 2,
    series_code: 'IGP-M',
    scheduled_for: '2026-05-20',
    status: 'realized',
    source_type: 'scraped',
  },
]

describe('CalendarStrip', () => {
  it('renders 30 day columns', () => {
    render(<CalendarStrip releases={[]} startDate="2026-05-11" />)
    const days = screen.getAllByTestId('calendar-strip-day')
    expect(days).toHaveLength(30)
  })

  it('renders the strip container', () => {
    render(<CalendarStrip releases={[]} />)
    expect(screen.getByTestId('calendar-strip')).toBeInTheDocument()
  })

  it('renders release chips for matching dates', () => {
    render(<CalendarStrip releases={mockReleases} startDate="2026-05-11" />)
    const chips = screen.getAllByTestId('calendar-release-chip')
    expect(chips.length).toBeGreaterThanOrEqual(1)
  })

  it('shows expected release chip with "E" status marker', () => {
    render(<CalendarStrip releases={mockReleases} startDate="2026-05-11" />)
    const chips = screen.getAllByTestId('calendar-release-chip')
    const expectedChip = chips.find((c) => c.textContent?.includes('IPCA'))
    expect(expectedChip).toBeDefined()
    // The chip contains "E" as the status marker
    expect(expectedChip?.textContent).toContain('E')
    expect(expectedChip?.textContent).toContain('IPCA')
  })

  it('shows realized release chip with "R" status marker', () => {
    render(<CalendarStrip releases={mockReleases} startDate="2026-05-11" />)
    const chips = screen.getAllByTestId('calendar-release-chip')
    const realizedChip = chips.find((c) => c.textContent?.includes('IGP-M'))
    expect(realizedChip).toBeDefined()
    expect(realizedChip?.textContent).toContain('R')
    expect(realizedChip?.textContent).toContain('IGP-M')
  })

  it('marks today column with data-date attribute matching today', () => {
    // Render without startDate — defaults to today
    render(<CalendarStrip releases={[]} />)
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    const isoToday = `${y}-${m}-${d}`
    // The first column (today) should have data-date matching today
    const days = screen.getAllByTestId('calendar-strip-day')
    const todayCol = days.find((el) => el.getAttribute('data-date') === isoToday)
    expect(todayCol).toBeDefined()
  })

  it('has role="list" on the strip', () => {
    render(<CalendarStrip releases={[]} />)
    expect(screen.getByTestId('calendar-strip')).toHaveAttribute('role', 'list')
  })
})
