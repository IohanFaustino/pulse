/**
 * DayDetailModal tests — phase 21.
 *
 * Covers:
 *   - Renders when open=true with correct title
 *   - Renders release rows with E/R badges, category chip, fonte
 *   - Shows count subtitle
 *   - Empty state when no releases
 *   - Closes on X button click
 *   - Closes on scrim click
 *   - Closes on Escape key
 *   - Returns null when open=false
 */

import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import DayDetailModal, { type DayDetailModalProps } from './index'

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY = new Date(2026, 4, 15) // 15 May 2026 — local time

const SERIES_LIST = [
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
  {
    code: 'PIB',
    name: 'PIB',
    category: 'Atividade',
    source: 'IBGE SIDRA',
    source_id: '5932',
    frequency: 'quarterly',
    unit: 'R$ milhões',
    first_observation: null,
    last_extraction_at: null,
    last_success_at: null,
    status: 'fresh',
  },
]

const RELEASES = [
  {
    id: 1,
    series_code: 'IPCA',
    scheduled_for: '2026-05-15',
    status: 'expected',
    source_type: 'scraped',
  },
  {
    id: 2,
    series_code: 'PIB',
    scheduled_for: '2026-05-15',
    status: 'realized',
    source_type: 'scraped',
  },
]

function renderModal(overrides: Partial<DayDetailModalProps> = {}) {
  const onClose = vi.fn()
  const props: DayDetailModalProps = {
    date: DAY,
    releases: RELEASES,
    series: SERIES_LIST,
    open: true,
    onClose,
    ...overrides,
  }
  const result = render(<DayDetailModal {...props} />)
  return { ...result, onClose }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DayDetailModal', () => {
  it('renders modal card when open', () => {
    renderModal()
    expect(screen.getByTestId('day-modal-card')).toBeInTheDocument()
  })

  it('shows title with dd/mm/yyyy date', () => {
    renderModal()
    // May 15 2026 = 15/05/2026
    const card = screen.getByTestId('day-modal-card')
    expect(card.textContent).toContain('15/05/2026')
  })

  it('shows correct release count in subtitle', () => {
    renderModal()
    const count = screen.getByTestId('day-modal-count')
    expect(count.textContent).toContain('2')
  })

  it('renders one row per release', () => {
    renderModal()
    const rows = screen.getAllByTestId('day-modal-release-row')
    expect(rows).toHaveLength(2)
  })

  it('shows series codes in rows', () => {
    renderModal()
    expect(screen.getByText('IPCA')).toBeInTheDocument()
    expect(screen.getByText('PIB')).toBeInTheDocument()
  })

  it('shows E badge for expected release', () => {
    renderModal()
    const rows = screen.getAllByTestId('day-modal-release-row')
    const ipcaRowEl = rows.find((r) => r.getAttribute('data-code') === 'IPCA')
    expect(ipcaRowEl).toBeTruthy()
    // Contains E badge
    expect(ipcaRowEl!.textContent).toContain('E')
  })

  it('shows R badge for realized release', () => {
    renderModal()
    const rows = screen.getAllByTestId('day-modal-release-row')
    const pibRow = rows.find((r) => r.getAttribute('data-code') === 'PIB')
    expect(pibRow).toBeTruthy()
    expect(pibRow!.textContent).toContain('R')
  })

  it('shows category chip for known series', () => {
    renderModal()
    // IPCA has category 'Inflação'
    expect(screen.getByText('Inflação')).toBeInTheDocument()
  })

  it('shows fonte text', () => {
    renderModal()
    // IBGE SIDRA appears for both IPCA and PIB
    const fontes = screen.getAllByText('IBGE SIDRA')
    expect(fontes.length).toBeGreaterThanOrEqual(1)
  })

  it('shows empty state when no releases', () => {
    renderModal({ releases: [] })
    expect(screen.getByTestId('day-modal-empty')).toBeInTheDocument()
    expect(screen.queryByTestId('day-modal-release-row')).not.toBeInTheDocument()
  })

  it('subtitle says "Nenhuma divulgação" when empty', () => {
    renderModal({ releases: [] })
    const count = screen.getByTestId('day-modal-count')
    expect(count.textContent).toContain('Nenhuma')
  })

  it('returns null when open=false', () => {
    const { container } = renderModal({ open: false })
    expect(container.firstChild).toBeNull()
  })

  it('calls onClose when X button clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()
    await user.click(screen.getByTestId('day-modal-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when scrim is clicked', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()
    const scrim = screen.getByTestId('day-modal-scrim')
    // Click the scrim element itself (not the card inside)
    await user.click(scrim)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on Escape key press', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT close when clicking inside the card', async () => {
    const user = userEvent.setup()
    const { onClose } = renderModal()
    const card = screen.getByTestId('day-modal-card')
    await user.click(card)
    // onClick is only on scrim; clicking card should not propagate to scrim handler
    // (the card click won't match e.target === e.currentTarget on scrim)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('singular subtitle for exactly 1 release', () => {
    renderModal({ releases: [RELEASES[0]!] })
    const count = screen.getByTestId('day-modal-count')
    expect(count.textContent).toContain('1 divulgação')
  })
})
