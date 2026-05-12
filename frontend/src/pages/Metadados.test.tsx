/**
 * Metadados page — test suite (Phase 16).
 *
 * Covers:
 *   1. Left list renders all series
 *   2. Search query filters left list
 *   3. Category chip filter narrows left list
 *   4. Click left item → right dossier updates
 *   5. URL param ?code=IPCA pre-selects series (FR-7.1)
 *   6. Dossier shows code, name, fonte, frequência, unidade, primeira obs (FR-7.2)
 *   7. Hero value renders when observations loaded
 *   8. Empty selection: EmptyState prompt shown
 *   9. No auto-select on default route (Req 1) — empty state shown without ?code
 *  10. Source group headings appear when category filter active (Req 4)
 *
 * Network is fully mocked — no real API calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SERIES_ITEMS = [
  {
    code: 'IPCA',
    name: 'Índice Nacional de Preços ao Consumidor Amplo',
    category: 'Inflação',
    source: 'BCB SGS',
    source_id: '433',
    frequency: 'monthly',
    unit: '%',
    first_observation: '1980-01-15',
    last_extraction_at: '2026-05-10T18:00:00Z',
    last_success_at: '2026-05-10T18:00:00Z',
    status: 'fresh',
    metadata: null,
  },
  {
    code: 'SELIC',
    name: 'Taxa SELIC',
    category: 'Juros',
    source: 'BCB SGS',
    source_id: '432',
    frequency: 'daily',
    unit: '% a.a.',
    first_observation: '1999-07-01',
    last_extraction_at: '2026-05-10T18:00:00Z',
    last_success_at: '2026-05-10T18:00:00Z',
    status: 'fresh',
    metadata: null,
  },
  {
    code: 'PIB',
    name: 'Produto Interno Bruto',
    category: 'Atividade',
    source: 'IBGE SIDRA',
    source_id: '5932',
    frequency: 'quarterly',
    unit: 'R$ mi',
    first_observation: '1996-01-01',
    last_extraction_at: null,
    last_success_at: null,
    status: 'stale',
    metadata: null,
  },
]

const OBSERVATIONS_ITEMS = Array.from({ length: 24 }, (_, i) => ({
  observed_at: `2024-${String(i + 1).padStart(2, '0')}-01T00:00:00Z`,
  value: 4.5 + i * 0.1,
  ingested_at: '2026-05-10T18:00:00Z',
}))

// ── Mock api/client ───────────────────────────────────────────────────────────

vi.mock('@/api/client', () => ({
  apiClient: {
    GET: vi.fn(),
  },
}))

import { apiClient } from '@/api/client'
const mockedGet = vi.mocked(apiClient.GET)

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })
}

interface WrapperOptions {
  initialEntries?: string[]
}

function Wrapper({ children, initialEntries = ['/metadados'] }: React.PropsWithChildren<WrapperOptions>) {
  const qc = makeQueryClient()
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        {children}
      </MemoryRouter>
    </QueryClientProvider>
  )
}

import Metadados from './Metadados'

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Metadados page', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default: GET /series → full list
    // GET /series/{code} → first series
    // GET /series/{code}/observations → observations
    mockedGet.mockImplementation(async (url: string, _opts?: unknown) => {
      if (url === '/series') {
        return {
          data: { items: SERIES_ITEMS, total: SERIES_ITEMS.length },
          error: undefined,
        }
      }
      if (typeof url === 'string' && url === '/series/{code}') {
        const code = (_opts as { params?: { path?: { code?: string } } })?.params?.path?.code
        const found = SERIES_ITEMS.find((s) => s.code === code)
        if (found) return { data: found, error: undefined }
        return { data: undefined, error: 'not found' }
      }
      if (typeof url === 'string' && url === '/series/{code}/observations') {
        return {
          data: {
            series_code: 'IPCA',
            items: OBSERVATIONS_ITEMS,
            total: OBSERVATIONS_ITEMS.length,
            returned: OBSERVATIONS_ITEMS.length,
            limit: 60,
            from_dt: null,
            to_dt: null,
          },
          error: undefined,
        }
      }
      return { data: undefined, error: 'unexpected url' }
    })
  })

  // ── Test 1: left list renders all series ───────────────────────────────────
  it('renders left list with all series codes', async () => {
    render(<Metadados />, { wrapper: ({ children }) => <Wrapper>{children}</Wrapper> })

    await waitFor(() => {
      expect(screen.getByTestId('list-item-IPCA')).toBeInTheDocument()
      expect(screen.getByTestId('list-item-SELIC')).toBeInTheDocument()
      expect(screen.getByTestId('list-item-PIB')).toBeInTheDocument()
    })
  })

  // ── Test 2: search query filters left list ─────────────────────────────────
  it('filters left list when search query matches code', async () => {
    const user = userEvent.setup()
    render(<Metadados />, { wrapper: ({ children }) => <Wrapper>{children}</Wrapper> })

    // Wait for list to load
    await waitFor(() => expect(screen.getByTestId('list-item-IPCA')).toBeInTheDocument())

    const input = screen.getByTestId('search-input')
    await user.type(input, 'SELIC')

    await waitFor(() => {
      expect(screen.getByTestId('list-item-SELIC')).toBeInTheDocument()
      expect(screen.queryByTestId('list-item-IPCA')).not.toBeInTheDocument()
      expect(screen.queryByTestId('list-item-PIB')).not.toBeInTheDocument()
    })
  })

  // ── Test 3: category chip filter narrows left list ─────────────────────────
  it('filters left list by category chip', async () => {
    const user = userEvent.setup()
    render(<Metadados />, { wrapper: ({ children }) => <Wrapper>{children}</Wrapper> })

    await waitFor(() => expect(screen.getByTestId('list-item-SELIC')).toBeInTheDocument())

    await user.click(screen.getByTestId('chip-Juros'))

    await waitFor(() => {
      expect(screen.getByTestId('list-item-SELIC')).toBeInTheDocument()
      expect(screen.queryByTestId('list-item-IPCA')).not.toBeInTheDocument()
      expect(screen.queryByTestId('list-item-PIB')).not.toBeInTheDocument()
    })
  })

  // ── Test 4: click left item → right pane updates ───────────────────────────
  it('updates dossier when a list item is clicked', async () => {
    const user = userEvent.setup()
    render(<Metadados />, { wrapper: ({ children }) => <Wrapper>{children}</Wrapper> })

    // Wait for SELIC to be clickable
    await waitFor(() => expect(screen.getByTestId('list-item-SELIC')).toBeInTheDocument())

    // Click SELIC
    await user.click(screen.getByTestId('list-item-SELIC'))

    // Dossier should now show SELIC
    await waitFor(() => {
      expect(screen.getByTestId('dossier-code')).toHaveTextContent('SELIC')
    })
  })

  // ── Test 5: URL param ?code=IPCA pre-selects ───────────────────────────────
  it('pre-selects series from URL ?code param', async () => {
    render(<Metadados />, {
      wrapper: ({ children }) => (
        <Wrapper initialEntries={['/metadados?code=IPCA']}>{children}</Wrapper>
      ),
    })

    await waitFor(() => {
      expect(screen.getByTestId('dossier-code')).toHaveTextContent('IPCA')
    })
  })

  // ── Test 6: dossier shows required fields (FR-7.2) ─────────────────────────
  it('renders dossier with code, name, fonte, frequência, unidade, primeira obs', async () => {
    render(<Metadados />, {
      wrapper: ({ children }) => (
        <Wrapper initialEntries={['/metadados?code=IPCA']}>{children}</Wrapper>
      ),
    })

    await waitFor(() => {
      // Code (header)
      expect(screen.getByTestId('dossier-code')).toHaveTextContent('IPCA')
      // Full name
      expect(screen.getByTestId('dossier-name')).toHaveTextContent(
        'Índice Nacional de Preços ao Consumidor Amplo',
      )
      // Fonte field
      expect(screen.getByTestId('field-fonte')).toHaveTextContent('BCB SGS')
      // Frequência field
      expect(screen.getByTestId('field-frequencia')).toHaveTextContent('Mensal')
      // Unidade field
      expect(screen.getByTestId('field-unidade')).toHaveTextContent('%')
      // Primeira observação (1980-01-15 → formatted)
      expect(screen.getByTestId('field-primeira-obs')).toBeInTheDocument()
    })
  })

  // ── Test 7: hero value renders from observations ───────────────────────────
  it('renders hero value when observations are loaded', async () => {
    render(<Metadados />, {
      wrapper: ({ children }) => (
        <Wrapper initialEntries={['/metadados?code=IPCA']}>{children}</Wrapper>
      ),
    })

    await waitFor(() => {
      const hero = screen.getByTestId('hero-value')
      // Should contain a formatted number (not "—")
      expect(hero.textContent).not.toBe('—')
      expect(hero.textContent?.length).toBeGreaterThan(0)
    })
  })

  // ── Test 8: no selection shows EmptyState prompt ───────────────────────────
  it('shows "Nenhuma série encontrada" when search matches nothing', async () => {
    const user = userEvent.setup()
    render(<Metadados />, { wrapper: ({ children }) => <Wrapper>{children}</Wrapper> })

    await waitFor(() => expect(screen.getByTestId('list-item-IPCA')).toBeInTheDocument())

    // Search for something that matches nothing
    const input = screen.getByTestId('search-input')
    await user.type(input, 'XXXXXXXXXNOTFOUND')

    await waitFor(() => {
      expect(screen.getByText('Nenhuma série encontrada.')).toBeInTheDocument()
    })
  })

  // ── Test 9: no auto-select on default route (Req 1) ───────────────────────
  it('shows empty state in right pane when no ?code param (no auto-select)', async () => {
    render(<Metadados />, { wrapper: ({ children }) => <Wrapper>{children}</Wrapper> })

    // Left list should load…
    await waitFor(() => expect(screen.getByTestId('list-item-IPCA')).toBeInTheDocument())

    // …but right pane must NOT auto-open a dossier
    expect(screen.queryByTestId('meta-dossier')).not.toBeInTheDocument()
    expect(screen.queryByTestId('dossier-skeleton')).not.toBeInTheDocument()

    // Empty state element should be visible
    expect(screen.getByTestId('empty-dossier')).toBeInTheDocument()
  })

  // ── Test 10: source group headings when category filter active (Req 4) ─────
  it('shows source group heading when category filter is not "Todos"', async () => {
    const user = userEvent.setup()
    render(<Metadados />, { wrapper: ({ children }) => <Wrapper>{children}</Wrapper> })

    await waitFor(() => expect(screen.getByTestId('list-item-IPCA')).toBeInTheDocument())

    // Activate "Atividade" filter — PIB (IBGE SIDRA) should appear under a source heading
    await user.click(screen.getByTestId('chip-Atividade'))

    await waitFor(() => {
      // PIB is IBGE SIDRA source
      expect(screen.getByTestId('source-heading-IBGE SIDRA')).toBeInTheDocument()
      // PIB itself should still be in the list
      expect(screen.getByTestId('list-item-PIB')).toBeInTheDocument()
      // IPCA and SELIC not in Atividade category — should be hidden
      expect(screen.queryByTestId('list-item-IPCA')).not.toBeInTheDocument()
      expect(screen.queryByTestId('list-item-SELIC')).not.toBeInTheDocument()
    })
  })

  // ── Bonus: sparkline renders inside dossier ────────────────────────────────
  it('renders sparkline inside dossier when observations are loaded', async () => {
    render(<Metadados />, {
      wrapper: ({ children }) => (
        <Wrapper initialEntries={['/metadados?code=IPCA']}>{children}</Wrapper>
      ),
    })

    await waitFor(() => {
      expect(screen.getByTestId('sparkline')).toBeInTheDocument()
    })
  })

  // ── Bonus: meta-list testid is present ────────────────────────────────────
  it('renders meta-list nav landmark', async () => {
    render(<Metadados />, { wrapper: ({ children }) => <Wrapper>{children}</Wrapper> })
    expect(screen.getByTestId('meta-list')).toBeInTheDocument()
  })
})
