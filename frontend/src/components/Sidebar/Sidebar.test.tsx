import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Sidebar from './index'
import { useUiStore } from '@/stores/uiStore'

// Mock useUserPrefs to avoid network calls
vi.mock('@/hooks/useUserPrefs', () => ({
  useUserPrefs: () => ({ data: { recents: ['IPCA', 'SELIC'] } }),
}))

// Reset Zustand uiStore before each test so sidebar state doesn't leak.
// Include theme + lang so test isolation is complete.
beforeEach(() => {
  useUiStore.setState({
    sidebarCollapsed: false,
    lastVisitedPage: '/',
    theme: 'light',
    lang: 'pt',
  })
})

function renderSidebar(initialPath = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Sidebar', () => {
  // ── Nav items ──────────────────────────────────────────────────────────────

  it('renders 4 nav items', () => {
    renderSidebar()
    // testids are based on stable id field, not translated label
    expect(screen.getByTestId('nav-item-painel')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-índices')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-calendário')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-metadados')).toBeInTheDocument()
  })

  it('is not collapsed by default', () => {
    renderSidebar()
    const sidebar = screen.getByTestId('sidebar')
    expect(sidebar).toHaveAttribute('data-collapsed', 'false')
  })

  it('toggle button collapses the sidebar', async () => {
    const user = userEvent.setup()
    renderSidebar()
    const toggleBtn = screen.getByTestId('sidebar-toggle')
    await user.click(toggleBtn)
    const sidebar = screen.getByTestId('sidebar')
    expect(sidebar).toHaveAttribute('data-collapsed', 'true')
  })

  it('toggle button second click re-expands the sidebar', async () => {
    const user = userEvent.setup()
    renderSidebar()
    const toggleBtn = screen.getByTestId('sidebar-toggle')
    await user.click(toggleBtn)
    await user.click(toggleBtn)
    expect(screen.getByTestId('sidebar')).toHaveAttribute('data-collapsed', 'false')
  })

  it('active route gets aria-current="page"', () => {
    renderSidebar('/indices')
    expect(screen.getByTestId('nav-item-índices')).toHaveAttribute('aria-current', 'page')
  })

  it('non-active routes do not have aria-current', () => {
    renderSidebar('/indices')
    expect(screen.getByTestId('nav-item-painel')).not.toHaveAttribute('aria-current')
    expect(screen.getByTestId('nav-item-calendário')).not.toHaveAttribute('aria-current')
  })

  // ── Recents ────────────────────────────────────────────────────────────────

  it('renders recents section when recents are available', () => {
    renderSidebar()
    expect(screen.getByTestId('sidebar-recents')).toBeInTheDocument()
  })

  it('renders recent items from useUserPrefs', () => {
    renderSidebar()
    expect(screen.getByTestId('recent-item-IPCA')).toBeInTheDocument()
    expect(screen.getByTestId('recent-item-SELIC')).toBeInTheDocument()
  })

  // ── Collapse button aria-labels (PT default) ───────────────────────────────

  it('toggle button has correct aria-label when expanded (PT)', () => {
    renderSidebar()
    expect(screen.getByTestId('sidebar-toggle')).toHaveAttribute(
      'aria-label',
      'Colapsar menu',
    )
  })

  it('toggle button has correct aria-label when collapsed (PT)', async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(screen.getByTestId('sidebar-toggle'))
    expect(screen.getByTestId('sidebar-toggle')).toHaveAttribute(
      'aria-label',
      'Expandir menu',
    )
  })

  // ── Theme toggle ───────────────────────────────────────────────────────────

  it('renders theme toggle button', () => {
    renderSidebar()
    expect(screen.getByTestId('theme-toggle')).toBeInTheDocument()
  })

  it('theme toggle is not pressed in light mode', () => {
    renderSidebar()
    expect(screen.getByTestId('theme-toggle')).toHaveAttribute('aria-pressed', 'false')
  })

  it('theme toggle becomes pressed after click (dark mode)', async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(screen.getByTestId('theme-toggle'))
    expect(screen.getByTestId('theme-toggle')).toHaveAttribute('aria-pressed', 'true')
    expect(useUiStore.getState().theme).toBe('dark')
  })

  it('theme toggle reverts to light on second click', async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(screen.getByTestId('theme-toggle'))
    await user.click(screen.getByTestId('theme-toggle'))
    expect(useUiStore.getState().theme).toBe('light')
  })

  // ── Lang toggle ────────────────────────────────────────────────────────────

  it('renders lang toggle group', () => {
    renderSidebar()
    expect(screen.getByTestId('lang-toggle')).toBeInTheDocument()
  })

  it('PT pill is active by default', () => {
    renderSidebar()
    expect(screen.getByTestId('lang-pt')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('lang-en')).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking EN pill switches lang to en', async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(screen.getByTestId('lang-en'))
    expect(useUiStore.getState().lang).toBe('en')
    expect(screen.getByTestId('lang-en')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('lang-pt')).toHaveAttribute('aria-pressed', 'false')
  })

  it('nav labels change to EN when lang is en', async () => {
    const user = userEvent.setup()
    renderSidebar()
    // Verify PT label before switch
    expect(screen.getByTestId('nav-item-painel').textContent).toContain('Painel')
    await user.click(screen.getByTestId('lang-en'))
    // After switch testid is still "nav-item-painel" but label changed
    expect(screen.getByTestId('nav-item-painel').textContent).toContain('Panel')
  })

  it('collapse toggle aria-labels change to EN when lang is en', async () => {
    const user = userEvent.setup()
    renderSidebar()
    await user.click(screen.getByTestId('lang-en'))
    // Expanded state — should show EN label
    expect(screen.getByTestId('sidebar-toggle')).toHaveAttribute(
      'aria-label',
      'Collapse menu',
    )
  })
})
