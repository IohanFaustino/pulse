/**
 * Painel — pinned-series dashboard page.
 *
 * Displays the user's curated dashboard: only pinned series appear here.
 * Features:
 *   - Greeting + pt-BR date
 *   - Status line: N with release today · X this week · K pinned
 *   - CategoryToggle for filtering / grouping
 *   - Grid of SmallMultiple cards (grouped by category when "Todos", flat when filtered)
 *   - Empty state with CTA → /indices when nothing is pinned
 *   - CalendarStrip (14 days, scoped to pinned series; falls back to all when none)
 *   - TransformModal (controlled, opened per card modify button)
 *
 * FR-4 (Pin/Unpin), FR-5 (Painel rendering), FR-8 (Transform modal)
 * AC-2 (pin), AC-3 (transform), AC-7 (empty state)
 */

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import styles from './Painel.module.css'

// ── Hooks ────────────────────────────────────────────────────────────────────
import { useUserPrefs, useUnpin, useSetTransform } from '@/hooks/useUserPrefs'
import { useSeries } from '@/hooks/useSeries'
import { useObservations } from '@/hooks/useObservations'
import { useReleases } from '@/hooks/useReleases'

// ── Stores ───────────────────────────────────────────────────────────────────
import { useUiStore } from '@/stores/uiStore'

// ── Components ───────────────────────────────────────────────────────────────
import SmallMultiple from '@/components/SmallMultiple'
import EmptyState from '@/components/EmptyState'
import CalendarStrip from '@/components/CalendarStrip'
import CategoryToggle, { type CategoryOption } from '@/components/CategoryToggle'
import TransformModal, { type TransformSpec } from '@/components/TransformModal'
import { SkeletonCard } from '@/components/LoadingSkeleton'
import RefreshButton from '@/components/RefreshButton'
import DailyRow from '@/components/DailyRow'

// ── Lib ──────────────────────────────────────────────────────────────────────
import { greeting, formatToday } from '@/lib/formatPtBR'
import { computeDelta } from '@/lib/deltaSemantics'
import { categoryColor } from '@/lib/categoryColor'
import { useTranslation } from '@/lib/i18n'

// ── Types ────────────────────────────────────────────────────────────────────
import type { components } from '@/api/schema'

type SeriesRead = components['schemas']['SeriesRead']
type ObservationRead = components['schemas']['ObservationRead']
type ReleaseRead = components['schemas']['ReleaseRead']
type CardTransformRead = components['schemas']['CardTransformRead']

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Category display order — matches doc §3 toggle order.
 */
const CATEGORY_ORDER = [
  'Inflação',
  'Atividade',
  'Trabalho',
  'Juros',
  'Câmbio',
  'Mercado',
  'Fiscal',
  'Externo',
] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function currentMonthYYYYMM(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** Count releases whose scheduled_for date is today. */
function countReleasesToday(releases: ReleaseRead[]): number {
  const today = toISODate(new Date())
  return releases.filter((r) => r.scheduled_for === today).length
}

/** Count releases whose scheduled_for falls in [today, today+6]. */
function countReleasesThisWeek(releases: ReleaseRead[]): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayISO = toISODate(today)
  const weekEnd = new Date(today)
  weekEnd.setDate(weekEnd.getDate() + 6)
  const weekEndISO = toISODate(weekEnd)
  return releases.filter(
    (r) => r.scheduled_for >= todayISO && r.scheduled_for <= weekEndISO,
  ).length
}

/** Build a Map<code, TransformSpec | null> from CardTransformRead[]. */
function buildTransformMap(
  cardTransforms: CardTransformRead[] | undefined,
): Map<string, TransformSpec | null> {
  const map = new Map<string, TransformSpec | null>()
  if (!cardTransforms) return map
  for (const ct of cardTransforms) {
    // cast Record<string, never> → TransformSpec
    map.set(ct.series_code, ct.transform_spec as unknown as TransformSpec)
  }
  return map
}

// ── Sub-component: single pinned card ────────────────────────────────────────

interface PinnedCardProps {
  code: string
  seriesMap: Map<string, SeriesRead>
  transformMap: Map<string, TransformSpec | null>
  onUnpin: (code: string) => void
  onModify: (code: string) => void
}

function PinnedCard({
  code,
  seriesMap,
  transformMap,
  onUnpin,
  onModify,
}: PinnedCardProps) {
  const { data: obsData, isLoading, isError } = useObservations({
    code,
    limit: 24,
  })

  const series = seriesMap.get(code)

  if (isLoading) {
    return <SkeletonCard />
  }

  if (isError) {
    return (
      <div
        className={styles.errorChip}
        data-testid="card-error"
        role="alert"
        aria-label={`Erro ao carregar ${code}`}
      >
        <span className={styles.errorCode}>{code}</span>
        <span className={styles.errorMsg}>falha ao carregar</span>
      </div>
    )
  }

  const observations: ObservationRead[] = obsData?.items ?? []
  const lastObs = observations.at(-1)
  const prevObs = observations.at(-2)

  const currentValue = lastObs?.value ?? null
  const sparklineValues = observations.map((o) => o.value)

  const deltaResult =
    currentValue !== null && prevObs !== undefined && series
      ? computeDelta(currentValue, prevObs.value, series.category)
      : null

  const activeTransform = transformMap.get(code) ?? null
  const activeTransformOp =
    activeTransform && activeTransform.op !== 'level' ? activeTransform.op : undefined

  return (
    <SmallMultiple
      code={code}
      name={series?.name ?? code}
      value={currentValue}
      delta={deltaResult?.delta}
      deltaDirection={deltaResult?.direction}
      category={series?.category ?? ''}
      unit={series?.unit}
      source={series?.source}
      sparklineValues={sparklineValues}
      activeTransform={activeTransformOp}
      onUnpin={onUnpin}
      onModify={onModify}
    />
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Painel() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const setLastVisitedPage = useUiStore((s) => s.setLastVisitedPage)
  const { t, lang } = useTranslation()

  // ── UI state ────────────────────────────────────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState<CategoryOption>('Todos')
  const [modalCode, setModalCode] = useState<string | null>(null)

  // ── Track visited page ──────────────────────────────────────────────────────
  useEffect(() => {
    setLastVisitedPage('/')
  }, [setLastVisitedPage])

  // ── Data queries ────────────────────────────────────────────────────────────
  const prefsQuery = useUserPrefs()
  const seriesQuery = useSeries()
  const releasesQuery = useReleases({ month: currentMonthYYYYMM() })

  const { unpin } = useUnpin()
  const { setTransform } = useSetTransform()

  // ── Derived data ────────────────────────────────────────────────────────────

  const pinnedCodes: string[] = useMemo(() => {
    const pins = prefsQuery.data?.pins ?? []
    // Sort by display order ascending
    return [...pins]
      .sort((a, b) => a.order - b.order)
      .map((p) => p.series_code)
  }, [prefsQuery.data?.pins])

  const seriesMap: Map<string, SeriesRead> = useMemo(() => {
    const map = new Map<string, SeriesRead>()
    for (const s of seriesQuery.data?.items ?? []) {
      map.set(s.code, s)
    }
    return map
  }, [seriesQuery.data?.items])

  const transformMap: Map<string, TransformSpec | null> = useMemo(
    () => buildTransformMap(prefsQuery.data?.card_transforms),
    [prefsQuery.data?.card_transforms],
  )

  const allReleases: ReleaseRead[] = releasesQuery.data?.items ?? []

  // Status counters
  const todayCount = useMemo(() => countReleasesToday(allReleases), [allReleases])
  const weekCount = useMemo(() => countReleasesThisWeek(allReleases), [allReleases])
  const pinnedCount = pinnedCodes.length

  // CalendarStrip releases — scoped to pinned codes when available; fallback to all
  const stripReleases: ReleaseRead[] = useMemo(() => {
    if (pinnedCodes.length === 0) return allReleases
    return allReleases.filter((r) => pinnedCodes.includes(r.series_code))
  }, [allReleases, pinnedCodes])

  // Cards to show based on category filter
  const filteredCodes: string[] = useMemo(() => {
    if (selectedCategory === 'Todos') return pinnedCodes
    return pinnedCodes.filter(
      (code) => seriesMap.get(code)?.category === selectedCategory,
    )
  }, [pinnedCodes, selectedCategory, seriesMap])

  // Grouped by category (used when selectedCategory === 'Todos')
  const groupedByCategory: Array<{ category: string; codes: string[] }> = useMemo(() => {
    const result: Array<{ category: string; codes: string[] }> = []
    for (const cat of CATEGORY_ORDER) {
      const codes = pinnedCodes.filter(
        (code) => seriesMap.get(code)?.category === cat,
      )
      if (codes.length > 0) {
        result.push({ category: cat, codes })
      }
    }
    // Append any pinned codes whose category is not in CATEGORY_ORDER
    const knownCats = new Set<string>(CATEGORY_ORDER)
    const otherCodes = pinnedCodes.filter((code) => {
      const cat = seriesMap.get(code)?.category
      return cat !== undefined && !knownCats.has(cat)
    })
    if (otherCodes.length > 0) {
      result.push({ category: 'Outros', codes: otherCodes })
    }
    return result
  }, [pinnedCodes, seriesMap])

  // ── Event handlers ───────────────────────────────────────────────────────────

  function handleUnpin(code: string) {
    unpin(code)
  }

  function handleModify(code: string) {
    setModalCode(code)
  }

  function handleTransformApply(spec: TransformSpec) {
    if (!modalCode) return
    setTransform(modalCode, spec)
    // Invalidate cached transform queries for this code so cards re-fetch
    queryClient.invalidateQueries({ queryKey: ['transform', modalCode] })
    setModalCode(null)
  }

  function handleModalCancel() {
    setModalCode(null)
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  function renderGrid(codes: string[]) {
    return (
      <div className={styles.grid} data-testid="painel-grid">
        {codes.map((code) => (
          <PinnedCard
            key={code}
            code={code}
            seriesMap={seriesMap}
            transformMap={transformMap}
            onUnpin={handleUnpin}
            onModify={handleModify}
          />
        ))}
      </div>
    )
  }

  function renderTodosGrouped() {
    return (
      <div data-testid="painel-grouped">
        {groupedByCategory.map(({ category, codes }) => (
          <section key={category} className={styles.categorySection}>
            <h2
              className={styles.categoryTitle}
              style={{ color: categoryColor(category) }}
              data-testid={`category-title-${category}`}
            >
              {category}
            </h2>
            {renderGrid(codes)}
          </section>
        ))}
      </div>
    )
  }

  // ── Main render ──────────────────────────────────────────────────────────────

  const greetingText = greeting(lang)
  const dateText = formatToday()

  const modalSeries = modalCode ? seriesMap.get(modalCode) : undefined

  return (
    <main
      className={styles.page}
      data-testid="page-painel"
    >
      {/* Greeting */}
      <header className={styles.header}>
        <div className={styles.greetingRow}>
          <h1 className={styles.greeting} data-testid="painel-greeting">
            {greetingText}
          </h1>
          <div className={styles.headerRight}>
            <RefreshButton />
            <time className={styles.date} data-testid="painel-date">
              {dateText}
            </time>
          </div>
        </div>
        <p className={styles.statusLine} data-testid="painel-status">
          <span data-testid="status-today-count">{todayCount}</span>
          {' '}
          {todayCount === 1 ? t('painel.status.today.one') : t('painel.status.today.many')}
          {' · '}
          <span data-testid="status-week-count">{weekCount}</span> {t('painel.status.week')}
          {' · '}
          <span data-testid="status-pinned-count">{pinnedCount}</span>
          {' '}
          {pinnedCount === 1 ? t('painel.status.pinned.one') : t('painel.status.pinned.many')}
        </p>
      </header>

      {/* Controls */}
      <div className={styles.controls}>
        <CategoryToggle
          selected={selectedCategory}
          onSelect={setSelectedCategory}
          totalCount={pinnedCount}
        />
      </div>

      {/* Content */}
      {pinnedCodes.length === 0 ? (
        <EmptyState
          icon="○"
          title={t('painel.empty.title')}
          subtitle={t('painel.empty.subtitle')}
          ctaLabel={t('painel.empty.cta')}
          onAction={() => navigate('/indices')}
        />
      ) : (
        <>
          {selectedCategory === 'Todos'
            ? renderTodosGrouped()
            : renderGrid(filteredCodes)}

          {/* 14-day release strip */}
          <section
            className={styles.calendarSection}
            aria-label="Próximas divulgações"
          >
            <h2 className={styles.calendarTitle} data-testid="calendar-section-title">
              {t('painel.calendar.title')}
            </h2>
            <CalendarStrip releases={stripReleases} />
          </section>

          {/* Daily-frequency series row */}
          <DailyRow />
        </>
      )}

      {/* TransformModal — controlled */}
      {modalCode !== null && modalSeries !== undefined && (
        <TransformModal
          code={modalCode}
          name={modalSeries.name}
          currentSpec={transformMap.get(modalCode) ?? null}
          onApply={handleTransformApply}
          onCancel={handleModalCancel}
        />
      )}
    </main>
  )
}
