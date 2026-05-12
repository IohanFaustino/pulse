/**
 * DailyTable — sortable table of all daily + event-frequency series.
 *
 * Sits below the calendar grid on the Calendário page.
 * Columns: Código · Fonte · Última coleta · Status dot
 *
 * Sortable by Código (default asc) and Última coleta (asc/desc).
 * Clicking a row opens AnalysisPanel for that series.
 *
 * FR-21 — Calendário extension (phase 21)
 */

import { useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import styles from './DailyTable.module.css'

import { useSeries } from '@/hooks/useSeries'
import { useHealth } from '@/hooks/useHealth'
import AnalysisPanel from '@/components/AnalysisPanel'
import { formatDatetime, relativeTime } from '@/lib/formatPtBR'

import type { SeriesRead } from '@/hooks/useSeries'
import type { SeriesFreshness } from '@/hooks/useHealth'

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

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortKey = 'code' | 'last_success_at'
type SortDir = 'asc' | 'desc'

function sortSeries(
  items: SeriesRead[],
  freshnessMap: Map<string, SeriesFreshness>,
  key: SortKey,
  dir: SortDir,
): SeriesRead[] {
  return [...items].sort((a, b) => {
    let cmp = 0
    if (key === 'code') {
      cmp = a.code.localeCompare(b.code)
    } else {
      // last_success_at — prefer freshness map, fall back to series field
      const aTs = freshnessMap.get(a.code)?.last_success_at ?? a.last_success_at ?? ''
      const bTs = freshnessMap.get(b.code)?.last_success_at ?? b.last_success_at ?? ''
      // null/empty sorts to end regardless of direction
      if (!aTs && !bTs) cmp = 0
      else if (!aTs) return 1
      else if (!bTs) return -1
      else cmp = aTs < bTs ? -1 : aTs > bTs ? 1 : 0
    }
    return dir === 'asc' ? cmp : -cmp
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface SortHeaderProps {
  children: React.ReactNode
  colKey: SortKey
  current: SortKey
  dir: SortDir
  onSort: (key: SortKey) => void
  testId?: string
}

function SortHeader({ children, colKey, current, dir, onSort, testId }: SortHeaderProps) {
  const active = current === colKey
  const indicator = active ? (dir === 'asc' ? ' ↑' : ' ↓') : ''
  return (
    <th
      className={`${styles.th} ${active ? styles.thActive : ''}`}
      onClick={() => onSort(colKey)}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      data-testid={testId}
    >
      {children}
      <span className={styles.sortIndicator} aria-hidden="true">
        {indicator}
      </span>
    </th>
  )
}

interface RowProps {
  series: SeriesRead
  freshness: SeriesFreshness | undefined
  onClick: (s: SeriesRead) => void
}

function TableRow({ series, freshness, onClick }: RowProps) {
  const lastSuccessAt = freshness?.last_success_at ?? series.last_success_at
  const status = resolveFreshness(lastSuccessAt)

  const datetimeStr = lastSuccessAt
    ? formatDatetime(lastSuccessAt)
    : '—'
  const relStr = lastSuccessAt ? relativeTime(lastSuccessAt) : 'nunca'

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
    <tr
      className={styles.row}
      role="button"
      tabIndex={0}
      aria-label={`${series.code} — ${series.name}. Clique para analisar.`}
      data-testid="daily-table-row"
      data-code={series.code}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <td className={styles.tdCode}>
        <span className={styles.code}>{series.code}</span>
        <span className={styles.name}>{series.name}</span>
      </td>
      <td className={styles.td}>
        <span className={styles.source}>{series.source}</span>
      </td>
      <td className={styles.td}>
        <span className={styles.datetime} title={datetimeStr}>
          {datetimeStr}
        </span>
        <span className={styles.relative}>{relStr}</span>
      </td>
      <td className={styles.tdDot}>
        <span
          className={styles.dot}
          data-status={status}
          aria-label={`Status: ${status}`}
          data-testid="daily-table-dot"
        />
      </td>
    </tr>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DailyTable() {
  const seriesQuery = useSeries()
  const healthQuery = useHealth()

  const [sortKey, setSortKey] = useState<SortKey>('code')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [panelSeries, setPanelSeries] = useState<SeriesRead | null>(null)

  // Filter to daily + event frequency only
  const dailySeries = useMemo<SeriesRead[]>(
    () =>
      (seriesQuery.data?.items ?? []).filter(
        (s) => s.frequency === 'daily' || s.frequency === 'event',
      ),
    [seriesQuery.data],
  )

  // Freshness map
  const freshnessMap = useMemo<Map<string, SeriesFreshness>>(() => {
    const map = new Map<string, SeriesFreshness>()
    for (const sf of healthQuery.data?.series ?? []) {
      map.set(sf.code, sf)
    }
    return map
  }, [healthQuery.data])

  // Sorted rows
  const sortedSeries = useMemo(
    () => sortSeries(dailySeries, freshnessMap, sortKey, sortDir),
    [dailySeries, freshnessMap, sortKey, sortDir],
  )

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
        return prev
      }
      setSortDir('asc')
      return key
    })
  }, [])

  const handleRowClick = useCallback((s: SeriesRead) => {
    setPanelSeries(s)
  }, [])

  const handlePanelClose = useCallback(() => {
    setPanelSeries(null)
  }, [])

  // Hide when no daily/event series (shouldn't happen in prod)
  if (!seriesQuery.isLoading && dailySeries.length === 0) {
    return null
  }

  return (
    <>
      <section
        className={styles.section}
        aria-label="Coletados diariamente"
        data-testid="daily-table-section"
      >
        {/* Header */}
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle} data-testid="daily-table-title">
            Coletados diariamente
          </h2>
          <p className={styles.sectionSub}>
            Atualização automática Mon-Fri 18:00 BRT
          </p>
        </div>

        {/* Table */}
        {seriesQuery.isLoading ? (
          <div className={styles.skeletonRows} aria-label="Carregando…" data-testid="daily-table-skeleton">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className={styles.skeletonRow} aria-hidden="true" />
            ))}
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table
              className={styles.table}
              aria-label="Tabela de séries coletadas diariamente"
              data-testid="daily-table"
            >
              <thead>
                <tr>
                  <SortHeader
                    colKey="code"
                    current={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                    testId="daily-table-sort-code"
                  >
                    Código
                  </SortHeader>
                  <th className={styles.th}>Fonte</th>
                  <SortHeader
                    colKey="last_success_at"
                    current={sortKey}
                    dir={sortDir}
                    onSort={handleSort}
                    testId="daily-table-sort-date"
                  >
                    Última coleta
                  </SortHeader>
                  <th className={styles.th} aria-label="Status de frescor" />
                </tr>
              </thead>
              <tbody>
                {sortedSeries.map((s) => (
                  <TableRow
                    key={s.code}
                    series={s}
                    freshness={freshnessMap.get(s.code)}
                    onClick={handleRowClick}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* AnalysisPanel portal */}
      {panelSeries !== null &&
        createPortal(
          <AnalysisPanel
            series={{ code: panelSeries.code, name: panelSeries.name, unit: panelSeries.unit, category: panelSeries.category }}
            open={panelSeries !== null}
            onClose={handlePanelClose}
          />,
          document.body,
        )}
    </>
  )
}
