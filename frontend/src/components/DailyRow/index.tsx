/**
 * DailyRow — horizontal chip strip for all daily-frequency series.
 *
 * Reads useSeries() filtered to frequency === 'daily', renders a
 * compact horizontal scrollable row of chips. Each chip shows:
 *   - series code (serif 14px)
 *   - last value + unit (mono small)
 *   - delta badge (DeltaBadge)
 *   - tiny sparkline (Sparkline, 60×24)
 *   - source badge (BCB SGS / Yahoo Finance)
 *   - freshness dot (green ≤24h / amber 24-72h / red >72h) from /health
 *
 * Clicking a chip opens AnalysisPanel for that series.
 * Section hidden entirely when no daily series are found.
 *
 * FR-19 — Diariamente row (phase 19)
 */

import { useState, useCallback } from 'react'
import styles from './DailyRow.module.css'

import { useSeries } from '@/hooks/useSeries'
import { useObservations } from '@/hooks/useObservations'
import { useHealth } from '@/hooks/useHealth'
import Sparkline from '@/components/Sparkline'
import DeltaBadge from '@/components/DeltaBadge'
import AnalysisPanel from '@/components/AnalysisPanel'
import { SkeletonRect } from '@/components/LoadingSkeleton'
import { computeDelta } from '@/lib/deltaSemantics'
import { formatNumber } from '@/lib/formatPtBR'

import type { components } from '@/api/schema'

type SeriesRead = components['schemas']['SeriesRead']
type SeriesFreshness = components['schemas']['SeriesFreshness']

// ── Freshness helpers ─────────────────────────────────────────────────────────

type FreshnessStatus = 'fresh' | 'stale' | 'failed' | 'unknown'

function resolveFreshness(lastSuccessAt: string | null | undefined): FreshnessStatus {
  if (!lastSuccessAt) return 'unknown'
  const ageMs = Date.now() - new Date(lastSuccessAt).getTime()
  const ageH = ageMs / (1000 * 60 * 60)
  if (ageH <= 24) return 'fresh'
  if (ageH <= 72) return 'stale'
  return 'failed'
}

function freshnessLabel(status: FreshnessStatus, lastSuccessAt: string | null | undefined): string {
  if (!lastSuccessAt || status === 'unknown') return 'nunca atualizado'
  const ageMs = Date.now() - new Date(lastSuccessAt).getTime()
  const ageH = Math.floor(ageMs / (1000 * 60 * 60))
  if (ageH < 1) {
    const ageMin = Math.floor(ageMs / (1000 * 60))
    return `há ${ageMin}min`
  }
  if (ageH < 24) return `há ${ageH}h`
  const ageD = Math.floor(ageH / 24)
  return `há ${ageD}d`
}

// ── Source badge label ────────────────────────────────────────────────────────

function sourceAbbr(source: string): string {
  if (source === 'Yahoo Finance') return 'Yahoo'
  if (source === 'BCB SGS') return 'BCB'
  return source
}

// ── Skeleton chip ─────────────────────────────────────────────────────────────

function SkeletonChip() {
  return (
    <div
      className={styles.chip}
      aria-hidden="true"
      data-testid="daily-chip-skeleton"
    >
      <div className={styles.chipTop}>
        <SkeletonRect width="52px" height="0.875rem" />
        <SkeletonRect width="28px" height="0.625rem" />
      </div>
      <SkeletonRect width="80%" height="1rem" />
      <div className={styles.chipBottom}>
        <SkeletonRect width="40%" height="0.625rem" />
        <SkeletonRect width="60px" height="16px" />
      </div>
      <SkeletonRect width="55%" height="0.625rem" />
    </div>
  )
}

// ── Single daily chip ─────────────────────────────────────────────────────────

interface DailyChipProps {
  series: SeriesRead
  freshness: SeriesFreshness | undefined
  onClick: (series: SeriesRead) => void
}

function DailyChip({ series, freshness, onClick }: DailyChipProps) {
  const { data: obsData, isLoading } = useObservations({ code: series.code, limit: 20 })

  const observations = obsData?.items ?? []
  const lastObs = observations.at(-1)
  const prevObs = observations.at(-2)
  const sparkValues = observations.map((o) => o.value)

  const currentValue = lastObs?.value ?? null
  const deltaResult =
    currentValue !== null && prevObs !== undefined
      ? computeDelta(currentValue, prevObs.value, series.category)
      : null

  const lastSuccessAt = freshness?.last_success_at ?? series.last_success_at
  const freshnessStatus = resolveFreshness(lastSuccessAt)
  const label = freshnessLabel(freshnessStatus, lastSuccessAt)

  function handleClick() {
    onClick(series)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onClick(series)
    }
  }

  return (
    <article
      className={styles.chip}
      role="button"
      tabIndex={0}
      aria-label={`${series.code} — ${series.name}. Clique para analisar.`}
      data-testid="daily-chip"
      data-code={series.code}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {/* Top row: code + source badge */}
      <div className={styles.chipTop}>
        <span className={styles.chipCode}>{series.code}</span>
        <span className={styles.sourceBadge} aria-label={`Fonte: ${series.source}`}>
          {sourceAbbr(series.source)}
        </span>
      </div>

      {/* Value row */}
      <div className={styles.chipValue}>
        {isLoading ? (
          <SkeletonRect width="75%" height="1rem" />
        ) : currentValue !== null ? (
          <span className={styles.chipNumber}>
            {formatNumber(currentValue)}
            {series.unit ? (
              <span className={styles.chipUnit}> {series.unit}</span>
            ) : null}
          </span>
        ) : (
          <span className={styles.chipNoData}>—</span>
        )}
      </div>

      {/* Delta + sparkline row */}
      <div className={styles.chipBottom}>
        <span className={styles.chipDelta}>
          {deltaResult ? (
            <DeltaBadge
              value={deltaResult.delta}
              category={series.category}
              direction={deltaResult.direction}
            />
          ) : (
            <span className={styles.chipNoData}>—</span>
          )}
        </span>
        <Sparkline
          values={sparkValues}
          width={60}
          height={24}
          variant={
            deltaResult
              ? deltaResult.direction === 'up'
                ? 'up'
                : deltaResult.direction === 'down'
                  ? 'down'
                  : 'neutral'
              : 'default'
          }
          className={styles.chipSparkline}
        />
      </div>

      {/* Freshness row */}
      <div className={styles.chipFreshness}>
        <span
          className={styles.freshnessDoc}
          data-status={freshnessStatus}
          aria-label={`Última atualização: ${label}`}
        />
        <span className={styles.freshnessLabel}>{label}</span>
      </div>
    </article>
  )
}

// ── Main DailyRow component ───────────────────────────────────────────────────

export default function DailyRow() {
  const seriesQuery = useSeries()
  const healthQuery = useHealth()

  const [panelSeries, setPanelSeries] = useState<SeriesRead | null>(null)

  const handleChipClick = useCallback((series: SeriesRead) => {
    setPanelSeries(series)
  }, [])

  const handlePanelClose = useCallback(() => {
    setPanelSeries(null)
  }, [])

  // Filter to daily series only
  const dailySeries: SeriesRead[] = (seriesQuery.data?.items ?? []).filter(
    (s) => s.frequency === 'daily',
  )

  // Build a Map<code, SeriesFreshness> for O(1) lookup
  const freshnessMap = new Map<string, SeriesFreshness>()
  for (const sf of healthQuery.data?.series ?? []) {
    freshnessMap.set(sf.code, sf)
  }

  // Hide section entirely when loaded and no daily series exist
  if (!seriesQuery.isLoading && dailySeries.length === 0) {
    return null
  }

  return (
    <>
      <section
        className={styles.section}
        aria-label="Séries com atualização diária"
        data-testid="daily-row-section"
      >
        {/* Section header */}
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} data-testid="daily-row-title">
            Diariamente
          </h2>
          <p className={styles.sectionSub}>atualizações diárias via API</p>
        </div>

        {/* Chip scroll track */}
        <div
          className={styles.track}
          role="list"
          aria-label="Séries diárias"
          data-testid="daily-row-track"
        >
          {seriesQuery.isLoading
            ? Array.from({ length: 7 }, (_, i) => <SkeletonChip key={i} />)
            : dailySeries.map((s) => (
                <div key={s.code} role="listitem">
                  <DailyChip
                    series={s}
                    freshness={freshnessMap.get(s.code)}
                    onClick={handleChipClick}
                  />
                </div>
              ))}
        </div>
      </section>

      {/* AnalysisPanel — portal, opened on chip click */}
      {panelSeries !== null && (
        <AnalysisPanel
          series={{ code: panelSeries.code, name: panelSeries.name }}
          open={panelSeries !== null}
          onClose={handlePanelClose}
        />
      )}
    </>
  )
}
