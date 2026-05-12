/**
 * SyncIndicator tests — relative-time formatting + status colour.
 *
 * Uses the `override` prop to bypass the live useHealth() query so tests
 * stay pure.
 */
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import SyncIndicator, { relativeTimePtBR } from './index'

function wrap(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
}

describe('relativeTimePtBR', () => {
  const now = new Date('2026-05-11T12:00:00Z')

  it('returns "agora" for sub-minute deltas', () => {
    expect(relativeTimePtBR('2026-05-11T11:59:30Z', now)).toBe('agora')
  })

  it('returns "há Xmin" for minute-scale deltas', () => {
    expect(relativeTimePtBR('2026-05-11T11:48:00Z', now)).toBe('há 12min')
  })

  it('returns "há Xh" for hour-scale deltas', () => {
    expect(relativeTimePtBR('2026-05-11T08:00:00Z', now)).toBe('há 4h')
  })

  it('returns "há Xd" for day-scale deltas', () => {
    expect(relativeTimePtBR('2026-05-08T12:00:00Z', now)).toBe('há 3d')
  })

  it('returns "nunca" when null', () => {
    expect(relativeTimePtBR(null, now)).toBe('nunca')
  })
})

describe('SyncIndicator', () => {
  it('renders "sincronizado" with ok status', () => {
    const future = new Date(Date.now() - 1_000).toISOString()
    wrap(<SyncIndicator override={{ status: 'ok', sync_at: future }} />)
    const el = screen.getByTestId('sync-indicator')
    expect(el).toHaveAttribute('data-status', 'ok')
    expect(el.textContent).toContain('sincronizado')
  })

  it('renders "aguardando dados" when pending', () => {
    wrap(<SyncIndicator override={{ status: 'pending', sync_at: null }} />)
    const el = screen.getByTestId('sync-indicator')
    expect(el).toHaveAttribute('data-status', 'pending')
    expect(el.textContent).toContain('aguardando dados')
  })

  it('renders "atrasado" when degraded', () => {
    const past = new Date(Date.now() - 60 * 60_000).toISOString()
    wrap(<SyncIndicator override={{ status: 'degraded', sync_at: past }} />)
    const el = screen.getByTestId('sync-indicator')
    expect(el).toHaveAttribute('data-status', 'degraded')
    expect(el.textContent).toContain('atrasado')
  })
})
