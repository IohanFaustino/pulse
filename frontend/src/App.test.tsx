/**
 * Smoke test for App root — Phase 8a router shell.
 *
 * Verifies:
 *   1. App renders without throwing (component tree is valid)
 *   2. Sidebar is present with 4 nav items
 *   3. Default route renders Painel stub page
 *
 * Network is fully mocked — no real API calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock the API client so no real requests fire
vi.mock('./api/client', () => ({
  apiClient: {
    GET: vi.fn().mockResolvedValue({
      data: {
        id: 1,
        pins: [],
        card_transforms: [],
        recents: [],
        updated_at: null,
      },
      error: undefined,
    }),
    PATCH: vi.fn().mockResolvedValue({ data: {}, error: undefined }),
  },
}))

import App from './App'

describe('App — smoke (Phase 8a)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders without crashing', () => {
    expect(() => render(<App />)).not.toThrow()
  })

  it('renders the sidebar', () => {
    render(<App />)
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
  })

  it('renders 4 nav items in sidebar', () => {
    render(<App />)
    expect(screen.getByTestId('nav-item-painel')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-índices')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-calendário')).toBeInTheDocument()
    expect(screen.getByTestId('nav-item-metadados')).toBeInTheDocument()
  })

  it('renders the Painel page by default', () => {
    render(<App />)
    expect(screen.getByTestId('page-painel')).toBeInTheDocument()
  })
})
