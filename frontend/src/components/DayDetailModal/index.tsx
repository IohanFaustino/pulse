/**
 * DayDetailModal — portal modal showing all releases for a selected calendar day.
 *
 * Props:
 *   date      — the selected day (null = not shown)
 *   releases  — all releases for that day
 *   series    — full series list for category / fonte lookup
 *   open      — whether the modal is mounted
 *   onClose   — close callback
 *
 * Closes on Escape key press or click on the scrim backdrop.
 * Respects prefers-reduced-motion (skips animation when set).
 *
 * FR-21 — Calendário extension (phase 21)
 */

import { useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import styles from './DayDetailModal.module.css'

import { categoryColor, categoryBgColor } from '@/lib/categoryColor'

import type { ReleaseRead } from '@/hooks/useReleases'
import type { SeriesRead } from '@/hooks/useSeries'

// ── Date formatter ────────────────────────────────────────────────────────────

const ddmmyyyyFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function formatDayTitle(date: Date): string {
  return ddmmyyyyFmt.format(date)
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ReleaseRowProps {
  release: ReleaseRead
  seriesMap: Map<string, SeriesRead>
  todayKey: string
}

function ReleaseRow({ release, seriesMap, todayKey }: ReleaseRowProps) {
  const meta = seriesMap.get(release.series_code)
  const isRealized = release.status === 'realized' || release.scheduled_for < todayKey

  const statusLabel = isRealized ? 'R' : 'E'
  const category = meta?.category ?? ''
  const fonte = meta?.source ?? '—'
  const fgColor = category ? categoryColor(category) : 'var(--ink)'
  const bgColor = category ? categoryBgColor(category) : 'var(--neutral-bg)'

  return (
    <li
      className={styles.releaseRow}
      data-testid="day-modal-release-row"
      data-code={release.series_code}
    >
      {/* Code */}
      <span className={styles.releaseCode}>{release.series_code}</span>

      {/* E/R badge */}
      <span
        className={`${styles.statusBadge} ${isRealized ? styles.badgeR : styles.badgeE}`}
        aria-label={isRealized ? 'Realizado' : 'Esperado'}
      >
        {statusLabel}
      </span>

      {/* Category chip */}
      {category && (
        <span
          className={styles.categoryChip}
          style={{ color: fgColor, background: bgColor }}
          aria-label={`Categoria: ${category}`}
        >
          {category}
        </span>
      )}

      {/* Fonte */}
      <span className={styles.fonte}>{fonte}</span>
    </li>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface DayDetailModalProps {
  date: Date | null
  releases: ReleaseRead[]
  series: SeriesRead[]
  open: boolean
  onClose: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DayDetailModal({
  date,
  releases,
  series,
  open,
  onClose,
}: DayDetailModalProps) {
  const id = useId()

  // Build series map for O(1) category + fonte lookup
  const seriesMap = new Map<string, SeriesRead>()
  for (const s of series) {
    seriesMap.set(s.code, s)
  }

  // Compute todayKey for E/R classification
  const now = new Date()
  const todayKey = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !date) return null

  const title = `Divulgações em ${formatDayTitle(date)}`
  const count = releases.length

  const modal = (
    <div
      className={styles.scrim}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      data-testid="day-modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
    >
      <div className={styles.card} data-testid="day-modal-card">
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerText}>
            <p className={styles.kicker}>Calendário</p>
            <h2 id={`${id}-title`} className={styles.title}>
              {title}
            </h2>
            <p className={styles.subtitle} data-testid="day-modal-count">
              {count === 0
                ? 'Nenhuma divulgação'
                : count === 1
                  ? '1 divulgação'
                  : `${count} divulgações`}
            </p>
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Fechar modal de divulgações"
            data-testid="day-modal-close"
            type="button"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <line
                x1="1"
                y1="1"
                x2="13"
                y2="13"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
              <line
                x1="13"
                y1="1"
                x2="1"
                y2="13"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        {/* Body */}
        <div className={styles.body}>
          {count === 0 ? (
            <p className={styles.emptyMsg} data-testid="day-modal-empty">
              Nenhuma divulgação agendada para este dia.
            </p>
          ) : (
            <ul className={styles.list} aria-label="Divulgações do dia">
              {releases.map((r) => (
                <ReleaseRow
                  key={r.id}
                  release={r}
                  seriesMap={seriesMap}
                  todayKey={todayKey}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
