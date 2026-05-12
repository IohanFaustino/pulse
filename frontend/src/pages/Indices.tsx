/**
 * Índices — catalog of UNPINNED economic indicator series.
 *
 * Shows all series that the user has NOT yet pinned to the Painel.
 * Pinning a series here sends it to the Painel and removes it from this view.
 *
 * Layout:
 *   1. Greeting ("Catálogo dos índices ainda não fixados...")
 *   2. Toolbar: search input + CategoryToggle (Todos / por categoria)
 *   3. Card grid — each card has star pin + sparkline + delta
 *      - When filter != "Todos", cards are grouped by source under small headings
 *   4. Empty states: all pinned / no search results
 *
 * Structural:
 *   - Page has fixed height (100dvh) so the window never scrolls
 *   - Header + toolbar stay at top
 *   - Card grid scrolls inside a .scrollArea flex child
 *
 * Data:
 *   - useSeries()     → full list of 25 series
 *   - useUserPrefs()  → pinned codes → filter OUT pinned from catalog
 *   - useObservations per visible card (limit=24) for sparkline + delta
 *
 * FR-4.1: pinned series must not appear in catalog.
 * AC-2:   star click → add_pins mutation → series disappears from catalog.
 */

import { useState, useMemo } from 'react'
import styles from './Indices.module.css'
import Card from '@/components/Card'
import CategoryToggle, { type CategoryOption } from '@/components/CategoryToggle'
import EmptyState from '@/components/EmptyState'
import { SkeletonGrid } from '@/components/LoadingSkeleton'
import { useSeries } from '@/hooks/useSeries'
import { useUserPrefs, usePin } from '@/hooks/useUserPrefs'
import { useObservations } from '@/hooks/useObservations'
import { computeDelta } from '@/lib/deltaSemantics'
import { categoryColor } from '@/lib/categoryColor'
import { useTranslation } from '@/lib/i18n'
import type { SeriesRead } from '@/hooks/useSeries'

// Category display order for grouped view (matches CategoryToggle order)
const CATEGORY_ORDER = [
  'Inflação',
  'Atividade',
  'Trabalho',
  'Juros',
  'Câmbio',
  'Mercado',
  'Fiscal',
  'Externo',
  'Renda Fixa',
  'Mercado Internacional',
  'Sustentabilidade',
  'Governança',
] as const

// ── Per-card observations sub-component ──────────────────────────────────────

interface CatalogCardProps {
  series: SeriesRead
  onPin: (code: string) => void
}

/**
 * Renders one Card with its own observations query for sparkline + delta.
 * Isolated into a sub-component so each card's query state is independent.
 * Card body click opens AnalysisPanel (handled internally by Card component).
 */
function CatalogCard({ series, onPin }: CatalogCardProps) {
  const { data: obsData } = useObservations({ code: series.code, limit: 24 })

  const values = useMemo(
    () => obsData?.items.map((o) => o.value) ?? [],
    [obsData],
  )

  const dates = useMemo(
    () => obsData?.items.map((o) => o.observed_at) ?? [],
    [obsData],
  )

  const deltaInfo = useMemo(() => {
    const last = values.at(-1)
    const prev = values.at(-2)
    if (last !== undefined && prev !== undefined) {
      return computeDelta(last, prev, series.category)
    }
    return null
  }, [values, series.category])

  const currentValue = values.at(-1) ?? null
  const lastUpdate = obsData?.items.at(-1)?.observed_at ?? series.last_success_at ?? undefined

  return (
    <Card
      code={series.code}
      name={series.name}
      value={currentValue}
      delta={deltaInfo?.delta}
      deltaDirection={deltaInfo?.direction}
      category={series.category}
      unit={series.unit}
      source={series.source}
      frequency={series.frequency}
      lastUpdate={lastUpdate ?? undefined}
      sparklineValues={values}
      sparklineDates={dates}
      pinned={false}
      onPin={onPin}
    />
  )
}

// ── Grouped category section ─────────────────────────────────────────────────

interface CategoryGroupProps {
  category: string
  items: SeriesRead[]
  onPin: (code: string) => void
}

function CategoryGroup({ category, items, onPin }: CategoryGroupProps) {
  // Inline category-coloured stripe + heading swatch
  const color = categoryColor(category)
  return (
    <div
      className={styles.sourceGroup}
      data-testid={`category-group-${category}`}
      style={{ ['--cat-current' as string]: color }}
    >
      <h3 className={styles.sourceHeading}>
        <span className={styles.categorySwatch} style={{ background: color }} aria-hidden="true" />
        {category}
        <span className={styles.categoryCount}>· {items.length}</span>
      </h3>
      <section
        className={styles.grid}
        aria-label={`Índices — ${category}`}
      >
        {items.map((series) => (
          <CatalogCard
            key={series.code}
            series={series}
            onPin={onPin}
          />
        ))}
      </section>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Indices() {
  // Local UI state
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<CategoryOption>('Todos')
  const { t } = useTranslation()

  // Remote data
  const { data: seriesData, isLoading: seriesLoading, isError: seriesError } = useSeries()
  const { data: prefsData, isLoading: prefsLoading } = useUserPrefs()
  const { pin } = usePin()

  // Derive pinned set from prefs
  const pinnedCodes = useMemo<ReadonlySet<string>>(() => {
    const codes = prefsData?.pins?.map((p) => p.series_code) ?? []
    return new Set(codes)
  }, [prefsData])

  // Full list minus pinned — FR-4.1
  const unpinnedSeries = useMemo<SeriesRead[]>(() => {
    const all = seriesData?.items ?? []
    return all.filter((s) => !pinnedCodes.has(s.code))
  }, [seriesData, pinnedCodes])

  // Apply search filter (case-insensitive substring on code or name)
  const afterSearch = useMemo<SeriesRead[]>(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return unpinnedSeries
    return unpinnedSeries.filter(
      (s) =>
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q),
    )
  }, [unpinnedSeries, searchQuery])

  // Apply category filter
  const filtered = useMemo<SeriesRead[]>(() => {
    if (activeCategory === 'Todos') return afterSearch
    return afterSearch.filter((s) => s.category === activeCategory)
  }, [afterSearch, activeCategory])

  // Always group by category. Order follows CATEGORY_ORDER; any unknown
  // category falls to the end alphabetically.
  const grouped = useMemo<{ category: string; items: SeriesRead[] }[]>(() => {
    const map = new Map<string, SeriesRead[]>()
    for (const s of filtered) {
      if (!map.has(s.category)) map.set(s.category, [])
      map.get(s.category)!.push(s)
    }
    const known = CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => ({
      category: c as string,
      items: map.get(c as string)!,
    }))
    const unknown = [...map.keys()]
      .filter((c) => !(CATEGORY_ORDER as readonly string[]).includes(c))
      .sort()
      .map((c) => ({ category: c, items: map.get(c)! }))
    return [...known, ...unknown]
  }, [filtered])

  // Handlers
  function handlePin(code: string) {
    pin(code)
  }

  function handleCategorySelect(cat: CategoryOption) {
    setActiveCategory(cat)
  }

  // Loading state
  const isLoading = seriesLoading || prefsLoading

  // Determine which empty state to show
  const allPinned =
    !isLoading &&
    !seriesError &&
    unpinnedSeries.length === 0 &&
    searchQuery.trim() === '' &&
    (seriesData?.items.length ?? 0) > 0

  const noResults =
    !isLoading &&
    !allPinned &&
    filtered.length === 0 &&
    (searchQuery.trim() !== '' || activeCategory !== 'Todos')

  return (
    <main className={styles.page} data-testid="page-indices">
      {/* ── Greeting ── */}
      <header className={styles.header}>
        <h1 className={styles.greeting} data-testid="indices-greeting">
          {t('indices.title')}
        </h1>
        <p className={styles.greetingSub}>
          {t('indices.subtitle')}
        </p>
      </header>

      {/* ── Toolbar: search + category toggle ── */}
      <div className={styles.toolbar}>
        {/* Search */}
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon} aria-hidden="true">⌕</span>
          <input
            type="search"
            role="searchbox"
            className={styles.searchInput}
            placeholder={t('indices.search.placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={t('indices.search.aria')}
            data-testid="indices-search"
          />
        </div>

        {/* Category toggle */}
        <CategoryToggle
          selected={activeCategory}
          onSelect={handleCategorySelect}
          totalCount={filtered.length}
        />

        {/* Result count — only show when not loading */}
        {!isLoading && (
          <span className={styles.count} aria-live="polite" data-testid="indices-count">
            {filtered.length === 1
              ? t('indices.count.one')
              : t('indices.count.many', { n: filtered.length })}
          </span>
        )}
      </div>

      {/* ── Scrollable content area ── */}
      <div className={styles.scrollArea}>
        {isLoading && <SkeletonGrid count={8} />}

        {seriesError && !isLoading && (
          <EmptyState
            icon="⚠"
            title="Erro ao carregar índices."
            subtitle="Verifique se a API está disponível e tente novamente."
            data-testid="indices-error"
          />
        )}

        {allPinned && (
          <div className={styles.emptyWrap} data-testid="indices-all-pinned">
            <EmptyState
              icon="★"
              title="Todos os índices estão fixados no Painel."
              subtitle="Desfixe algum índice no Painel para vê-lo novamente aqui."
            />
          </div>
        )}

        {noResults && (
          <div className={styles.emptyWrap} data-testid="indices-no-results">
            <EmptyState
              icon="○"
              title="Nenhum índice encontrado."
              subtitle="Tente outro termo ou selecione uma categoria diferente."
            />
          </div>
        )}

        {!isLoading && !allPinned && !noResults && !seriesError && (
          <div data-testid="indices-grid">
            {grouped.map(({ category, items }) => (
              <CategoryGroup
                key={category}
                category={category}
                items={items}
                onPin={handlePin}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
