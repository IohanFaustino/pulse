/**
 * Metadados page — two-column dossier view.
 *
 * Layout:
 *   Left (sticky, scrollable): filtered series list (code + category chip).
 *   Right: dossier card for the selected series.
 *
 * Deep-link: ?code=IPCA pre-selects a series on load.
 * State: searchQuery, activeCategory (local) + selectedCode (URL param).
 *
 * Data:
 *   - useSeries()                      → left list
 *   - useSeriesOne(selectedCode)        → dossier metadata
 *   - useObservations({ code, limit })  → hero value + sparkline (last 24)
 *
 * FR-7.1, FR-7.2 | doc §6 | NFR-5 pt-BR
 */

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSeries } from '@/hooks/useSeries'
import type { SeriesRead } from '@/hooks/useSeries'
import { useSeriesOne } from '@/hooks/useSeriesOne'
import { useObservations } from '@/hooks/useObservations'
import {
  useAddRecent,
  useUserPrefs,
  usePin,
  useUnpin,
} from '@/hooks/useUserPrefs'
import Sparkline from '@/components/Sparkline'
import AnalysisPanel from '@/components/AnalysisPanel'
import { SkeletonRect } from '@/components/LoadingSkeleton'
import EmptyState from '@/components/EmptyState'
import DeltaBadge from '@/components/DeltaBadge'
import { categoryColor, categoryBgColor } from '@/lib/categoryColor'
import { computeDelta } from '@/lib/deltaSemantics'
import { formatDate, formatNumber, greeting, relativeTime, splitUnit } from '@/lib/formatPtBR'
import { useTranslation } from '@/lib/i18n'
import styles from './Metadados.module.css'

// ── Static lookup tables ──────────────────────────────────────────────────────

const CATEGORIES = [
  'Todos',
  'Inflação',
  'Juros',
  'Câmbio',
  'Mercado',
  'Atividade',
  'Trabalho',
  'Fiscal',
  'Externo',
  'Renda Fixa',
  'Mercado Internacional',
  'Sustentabilidade',
  'Governança',
]

/** Source display order for grouped list (matches Indices page Phase 14). */
const SOURCE_ORDER = ['BCB SGS', 'IBGE SIDRA', 'Yahoo Finance']

/** Maps series source → official website URL. */
const SOURCE_URL: Record<string, string> = {
  'BCB SGS': 'https://www.bcb.gov.br',
  'IBGE SIDRA': 'https://sidra.ibge.gov.br',
  'Yahoo': 'https://finance.yahoo.com',
  'Yahoo Finance': 'https://finance.yahoo.com',
  'ANBIMA': 'https://data.anbima.com.br/indices',
  'B3': 'https://www.b3.com.br/pt_br/market-data-e-indices/indices/',
}

/** Maps series source → methodology URL text. */
const METHODOLOGY_URL: Record<string, string> = {
  'BCB SGS': 'https://www.bcb.gov.br/estatisticas/metodologia',
  'IBGE SIDRA': 'https://www.ibge.gov.br/metodos_e_divulgacoes/metodologias.html',
  'Yahoo': 'https://finance.yahoo.com',
  'Yahoo Finance': 'https://finance.yahoo.com',
  'ANBIMA': 'https://www.anbima.com.br/informacoes/ima/ima.asp',
  'B3': 'https://www.b3.com.br/pt_br/market-data-e-indices/indices/',
}

/** Safely render hostname; fall back to source label if URL parse fails. */
function _safeHostname(url: string, fallback: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return fallback
  }
}

/** Maps frequency value to pt-BR display label. */
const FREQUENCY_LABEL: Record<string, string> = {
  daily: 'Diária',
  monthly: 'Mensal',
  quarterly: 'Trimestral',
  event: 'Por evento',
}

/**
 * Derive an editorial description from series metadata or a static fallback.
 * `series.metadata` is typed as `Record<string, never>` in the schema but may
 * carry a `description` string at runtime — access via unknown cast.
 */
function getDescription(series: SeriesRead): string {
  const meta = series.metadata as unknown as Record<string, unknown> | null
  if (meta && typeof meta['description'] === 'string' && meta['description'].length > 0) {
    return meta['description']
  }
  // Fallback: generate a compact description from the series fields
  const freq = FREQUENCY_LABEL[series.frequency] ?? series.frequency
  return `${series.name} — série ${freq.toLowerCase()} divulgada pela fonte ${series.source}. ` +
    `Unidade de medida: ${series.unit}. ` +
    `Código interno: ${series.code}.`
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface CategoryChipProps {
  category: string
  small?: boolean
}

function CategoryChip({ category, small = false }: CategoryChipProps) {
  return (
    <span
      className={small ? styles.listCategoryChip : styles.dossierCategoryChip}
      style={{
        color: categoryColor(category),
        background: categoryBgColor(category),
      }}
    >
      {category}
    </span>
  )
}

// ── Left list skeleton ────────────────────────────────────────────────────────

function ListSkeleton() {
  return (
    <div className={styles.skeletonList} aria-busy="true">
      {Array.from({ length: 10 }, (_, i) => (
        <SkeletonRect key={i} width="80%" height="1.25rem" />
      ))}
    </div>
  )
}

// ── Dossier skeleton ──────────────────────────────────────────────────────────

function DossierSkeleton() {
  return (
    <div className={styles.skeletonDossier} data-testid="dossier-skeleton">
      <div className={styles.skeletonDossierHeader}>
        <SkeletonRect width="25%" height="2.25rem" />
        <SkeletonRect width="65%" height="1rem" />
        <SkeletonRect width="100%" height="0.875rem" />
        <SkeletonRect width="90%" height="0.875rem" />
      </div>
      <div className={styles.skeletonFieldGrid}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className={styles.skeletonFieldCell}>
            <SkeletonRect width="45%" height="0.625rem" />
            <SkeletonRect width="75%" height="0.9375rem" />
          </div>
        ))}
      </div>
      <div className={styles.skeletonSnapshot}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <SkeletonRect width="3rem" height="0.625rem" />
          <SkeletonRect width="6rem" height="2.5rem" />
        </div>
        <SkeletonRect width="100%" height="2rem" />
      </div>
    </div>
  )
}

// ── Status dot ────────────────────────────────────────────────────────────────

function StatusBadge({ status, hint }: { status: string; hint?: string | null }) {
  const { t } = useTranslation()
  const dotClass =
    status === 'fresh'
      ? styles.statusFresh
      : status === 'stale'
        ? styles.statusStale
        : styles.statusFailed

  const labelKey =
    status === 'fresh'
      ? 'metadados.status.fresh'
      : status === 'stale'
        ? 'metadados.status.stale'
        : 'metadados.status.failed'

  return (
    <span className={styles.statusBadge}>
      <span className={`${styles.statusDot} ${dotClass}`} />
      {t(labelKey)}
      {hint && <span className={styles.statusHint}>· {hint}</span>}
    </span>
  )
}

// ── Dossier card ──────────────────────────────────────────────────────────────

interface DossierProps {
  code: string
}

function Dossier({ code }: DossierProps) {
  const { data: series, isLoading: seriesLoading } = useSeriesOne(code)
  const { data: obsData, isLoading: obsLoading } = useObservations({ code, limit: 60 })
  const { data: prefs } = useUserPrefs()
  const { pin } = usePin()
  const { unpin } = useUnpin()
  const { t, lang } = useTranslation()
  const [analysisOpen, setAnalysisOpen] = useState(false)

  if (seriesLoading || obsLoading) return <DossierSkeleton />
  if (!series) {
    return (
      <div className={styles.emptyDossier}>
        <EmptyState
          icon="○"
          title="Série não encontrada"
          subtitle={`O código "${code}" não foi localizado.`}
        />
      </div>
    )
  }

  // Last 60 observations for sparkline + dates for tooltip (Plotly-style)
  const allObs = obsData?.items ?? []
  const sparklineObs = allObs.slice(-24)
  const sparklineValues = sparklineObs.map((o) => o.value)
  const sparklineDates = sparklineObs.map((o) => o.observed_at)

  // Hero value + delta vs previous observation
  const latestObs = allObs.at(-1)
  const prevObs = allObs.at(-2)
  const heroValue = latestObs !== undefined ? formatNumber(latestObs.value) : '—'
  const deltaInfo =
    latestObs !== undefined && prevObs !== undefined
      ? computeDelta(latestObs.value, prevObs.value, series.category)
      : null

  const [unitCore, unitQualifier] = splitUnit(series.unit)
  const freq = FREQUENCY_LABEL[series.frequency] ?? series.frequency
  const sourceUrl = SOURCE_URL[series.source] ?? '#'
  const methodologyUrl = METHODOLOGY_URL[series.source] ?? '#'
  const isPinned = (prefs?.pins ?? []).some((p) => p.series_code === series.code)

  function togglePin() {
    if (isPinned) unpin(series.code)
    else pin(series.code)
  }

  const lastUpdateRel = series.last_success_at
    ? relativeTime(series.last_success_at)
    : null

  return (
    <div className={styles.dossier} data-testid="meta-dossier">
      {/* ── Header: code + chips + actions ─────────────────────────────── */}
      <div className={styles.dossierHeader}>
        <div className={styles.dossierCodeRow}>
          <h1 className={styles.dossierCode} data-testid="dossier-code">
            {series.code}
          </h1>
          <CategoryChip category={series.category} />
          <StatusBadge status={series.status} hint={lastUpdateRel} />

          {/* Primary actions — pin + open analysis */}
          <div className={styles.dossierActions}>
            <button
              type="button"
              className={[
                styles.actionStar,
                isPinned ? styles.actionStarPinned : '',
              ].filter(Boolean).join(' ')}
              onClick={togglePin}
              aria-pressed={isPinned}
              aria-label={
                isPinned ? t('metadados.action.unpin') : t('metadados.action.pin')
              }
              title={
                isPinned ? t('metadados.action.unpin') : t('metadados.action.pin')
              }
              data-testid="dossier-pin-btn"
            >
              {isPinned ? '★' : '☆'}
            </button>
            <button
              type="button"
              className={styles.actionPrimary}
              onClick={() => setAnalysisOpen(true)}
              data-testid="dossier-analysis-btn"
            >
              {t('metadados.action.analysis')}
            </button>
          </div>
        </div>
        <p className={styles.dossierName} data-testid="dossier-name">
          {series.name}
        </p>
      </div>

      {/* ── Hero value block (promoted to top) ──────────────────────────── */}
      <section
        className={styles.heroSection}
        aria-label={t('metadados.value.current')}
      >
        <div className={styles.heroLeft}>
          <span className={styles.heroLabel}>{t('metadados.value.current')}</span>
          <div className={styles.heroValueRow}>
            <span className={styles.heroValue} data-testid="hero-value">
              {heroValue}
            </span>
            {unitCore && (
              <span
                className={styles.heroUnit}
                title={unitQualifier ?? undefined}
              >
                {unitCore}
              </span>
            )}
            {deltaInfo && (
              <DeltaBadge
                value={deltaInfo.delta}
                category={series.category}
                direction={deltaInfo.direction}
              />
            )}
          </div>
          {latestObs && (
            <span className={styles.heroDate}>
              {t('metadados.value.updatedAt', {
                date: formatDate(latestObs.observed_at),
              })}
            </span>
          )}
        </div>

        {/* Tinted sparkline with Plotly-style hover tooltip */}
        <div className={styles.sparklineWrap}>
          <Sparkline
            values={sparklineValues}
            dates={sparklineDates}
            width={320}
            height={64}
            color={categoryColor(series.category)}
            unit={unitCore}
          />
        </div>
      </section>

      {/* ── Identificação ──────────────────────────────────────────────── */}
      <section className={styles.fieldSection} aria-label={t('metadados.section.id')}>
        <h2 className={styles.sectionHeading}>{t('metadados.section.id')}</h2>
        <div className={styles.fieldGrid} role="list">
          <div className={styles.fieldCell} role="listitem">
            <span className={styles.fieldLabel}>{t('metadados.field.fonte')}</span>
            <span className={styles.fieldValue} data-testid="field-fonte">
              {series.source}
            </span>
          </div>
          <div className={styles.fieldCell} role="listitem">
            <span className={styles.fieldLabel}>{t('metadados.field.frequencia')}</span>
            <span className={styles.fieldValue} data-testid="field-frequencia">
              {freq}
            </span>
          </div>
          <div className={styles.fieldCell} role="listitem">
            <span className={styles.fieldLabel}>{t('metadados.field.unidade')}</span>
            <span className={styles.fieldValue} data-testid="field-unidade">
              {series.unit}
            </span>
          </div>
        </div>
      </section>

      {/* ── Histórico ──────────────────────────────────────────────────── */}
      <section className={styles.fieldSection} aria-label={t('metadados.section.history')}>
        <h2 className={styles.sectionHeading}>{t('metadados.section.history')}</h2>
        <div className={styles.fieldGrid} role="list">
          {series.first_observation && (
            <div className={styles.fieldCell} role="listitem">
              <span className={styles.fieldLabel}>{t('metadados.field.primeira_obs')}</span>
              <span className={styles.fieldValue} data-testid="field-primeira-obs">
                {formatDate(series.first_observation)}
              </span>
            </div>
          )}
          {series.last_success_at && (
            <div className={styles.fieldCell} role="listitem">
              <span className={styles.fieldLabel}>{t('metadados.field.ultima_div')}</span>
              <span className={styles.fieldValue}>
                {formatDate(series.last_success_at)}
              </span>
            </div>
          )}
          <div className={styles.fieldCell} role="listitem">
            <span className={styles.fieldLabel}>{t('metadados.field.proxima_div')}</span>
            <span
              className={[
                styles.fieldValue,
                series.next_release_at ? styles.fieldValueNavy : styles.fieldValueEmpty,
              ].join(' ')}
              data-testid="field-proxima-divulgacao"
            >
              {series.next_release_at
                ? formatDate(series.next_release_at)
                : t('metadados.proxima.empty')}
            </span>
          </div>
        </div>
      </section>

      {/* ── Recursos (links as action chips) ────────────────────────────── */}
      <section className={styles.fieldSection} aria-label={t('metadados.section.resources')}>
        <h2 className={styles.sectionHeading}>{t('metadados.section.resources')}</h2>
        <div className={styles.resourceRow}>
          <a
            href={`/calendario?code=${series.code}`}
            className={styles.resourceChip}
            data-testid="field-calendario-link"
          >
            {t('metadados.field.ver_calendario')}
          </a>
          {methodologyUrl !== '#' && (
            <a
              href={methodologyUrl}
              className={styles.resourceChip}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('metadados.action.methodology')} ↗
            </a>
          )}
          {sourceUrl !== '#' && (
            <a
              href={sourceUrl}
              className={styles.resourceChip}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="field-site-oficial"
            >
              {t('metadados.action.site')} · {_safeHostname(sourceUrl, series.source)} ↗
            </a>
          )}
        </div>
      </section>

      <AnalysisPanel
        series={{
          code: series.code,
          name: series.name,
          unit: series.unit,
          category: series.category,
        }}
        open={analysisOpen}
        onClose={() => setAnalysisOpen(false)}
      />
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Metadados() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState('Todos')
  const { t, lang } = useTranslation()

  const { data: seriesData, isLoading: listLoading } = useSeries()

  const allSeries: SeriesRead[] = seriesData?.items ?? []

  // Filtered list
  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return allSeries.filter((s) => {
      const matchesSearch =
        q === '' ||
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q)
      const matchesCategory =
        activeCategory === 'Todos' || s.category === activeCategory
      return matchesSearch && matchesCategory
    })
  }, [allSeries, searchQuery, activeCategory])

  // Grouped by source when a category filter is active (Req 4)
  const grouped = useMemo(() => {
    if (activeCategory === 'Todos') return null
    const map = new Map<string, SeriesRead[]>()
    for (const s of filtered) {
      if (!map.has(s.source)) map.set(s.source, [])
      map.get(s.source)!.push(s)
    }
    return SOURCE_ORDER
      .filter(src => map.has(src))
      .map(src => ({ source: src, items: map.get(src)! }))
  }, [filtered, activeCategory])

  const selectedCode = searchParams.get('code')
  const { addRecent } = useAddRecent()

  // Track recents whenever a code is actually selected.
  useEffect(() => {
    if (selectedCode) {
      addRecent(selectedCode)
    }
    // addRecent identity changes each render via mutation hook; exclude it to
    // avoid an infinite mutation loop. We only care about the code change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCode])

  function handleSelectCode(code: string) {
    setSearchParams({ code }, { replace: true })
  }

  return (
    <main className={styles.page} data-testid="page-metadados">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <div className={styles.topbar}>
        <div className={styles.headerBlock}>
          <p className={styles.greetingKicker}>{greeting(lang)}</p>
          <h1 className={styles.pageTitle}>{t('metadados.title')}</h1>
          <p className={styles.pageSubtitle}>{t('metadados.subtitle')}</p>
        </div>

        <div className={styles.toolbar}>
          {/* Search with inline clear button */}
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon} aria-hidden="true">⌕</span>
            <input
              className={styles.searchInput}
              type="search"
              placeholder={t('metadados.search.placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={t('metadados.search.aria')}
              data-testid="search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className={styles.searchClear}
                onClick={() => setSearchQuery('')}
                aria-label={t('metadados.search.clear')}
                data-testid="search-clear"
              >
                ×
              </button>
            )}
          </div>

          {/* Category chips */}
          <div className={styles.chips} role="group" aria-label="Filtrar por categoria">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`${styles.chip} ${activeCategory === cat ? styles.chipActive : ''}`}
                onClick={() => setActiveCategory(cat)}
                aria-pressed={activeCategory === cat}
                data-testid={`chip-${cat}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Two-column body ─────────────────────────────────────────────── */}
      <div className={styles.body}>
        {/* Left: series list */}
        <nav
          className={styles.leftPanel}
          aria-label="Lista de séries"
          data-testid="meta-list"
        >
          {listLoading ? (
            <ListSkeleton />
          ) : filtered.length === 0 ? (
            <p className={styles.listEmpty}>
              {t('metadados.list.empty')}
            </p>
          ) : grouped ? (
            // Clustered by source when category filter is active (Req 4)
            grouped.map(({ source, items }) => (
              <div key={source} className={styles.sourceGroup}>
                <p className={styles.sourceHeading} data-testid={`source-heading-${source}`}>{source}</p>
                {items.map((s) => (
                  <button
                    key={s.code}
                    type="button"
                    className={`${styles.listItem} ${selectedCode === s.code ? styles.listItemActive : ''}`}
                    onClick={() => handleSelectCode(s.code)}
                    aria-current={selectedCode === s.code ? 'true' : undefined}
                    data-testid={`list-item-${s.code}`}
                  >
                    <span className={styles.listCode}>{s.code}</span>
                    {activeCategory === 'Todos' && <CategoryChip category={s.category} small />}
                  </button>
                ))}
              </div>
            ))
          ) : (
            // Flat list when "Todos" is active
            filtered.map((s) => (
              <button
                key={s.code}
                type="button"
                className={`${styles.listItem} ${selectedCode === s.code ? styles.listItemActive : ''}`}
                onClick={() => handleSelectCode(s.code)}
                aria-current={selectedCode === s.code ? 'true' : undefined}
                data-testid={`list-item-${s.code}`}
              >
                <span className={styles.listCode}>{s.code}</span>
                <CategoryChip category={s.category} small />
              </button>
            ))
          )}
        </nav>

        {/* Right: dossier */}
        <div className={styles.rightPanel}>
          {selectedCode ? (
            <Dossier code={selectedCode} />
          ) : (
            <div className={styles.emptyDossier} data-testid="empty-dossier">
              <EmptyState
                icon="◎"
                title={t('metadados.select.prompt')}
                subtitle={t('metadados.select.subtitle')}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
