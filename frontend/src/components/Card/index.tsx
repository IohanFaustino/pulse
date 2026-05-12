/**
 * Card — economic indicator card for the Índices catalog page.
 *
 * Shows: code, info icon (popover w/ name/source/freq/date), current value,
 * delta badge, sparkline, source/freq/date meta.
 * Includes a star pin button (SVG) to add the series to the Painel.
 *
 * Clicking the card body opens AnalysisPanel instead of navigating.
 * Clicking ⓘ or ★ buttons stops propagation so they don't open the panel.
 */

import { useState, useEffect, useRef } from 'react'
import styles from './Card.module.css'
import DeltaBadge from '@/components/DeltaBadge'
import Sparkline from '@/components/Sparkline'
import AnalysisPanel from '@/components/AnalysisPanel'
import {
  formatNumber,
  formatDate,
  splitUnit,
  frequencyPill,
  relativeDate,
} from '@/lib/formatPtBR'
import { categoryColor } from '@/lib/categoryColor'
import type { DeltaDirection } from '@/lib/deltaSemantics'

export interface CardProps {
  /** Series code, e.g. 'IPCA' */
  code: string
  /** Human-readable name — shown in popover and AnalysisPanel */
  name: string
  /** Current value */
  value: number | null
  /** Delta from previous observation */
  delta?: number
  /** Direction override (skip auto-computation) */
  deltaDirection?: DeltaDirection
  /** pt-BR category for semantic colouring */
  category: string
  /** Unit string, e.g. '%' */
  unit?: string
  /** Source label, e.g. 'BCB SGS' */
  source?: string
  /** Frequency label, e.g. 'mensal' */
  frequency?: string
  /** ISO date string of last update */
  lastUpdate?: string
  /** Whether this series is currently pinned */
  pinned?: boolean
  /** Sparkline data points */
  sparklineValues?: (number | null)[]
  /** ISO date strings aligned 1:1 to sparklineValues — enables hover tooltip */
  sparklineDates?: string[]
  /** Called when the star pin button is clicked */
  onPin?: (code: string) => void
  /**
   * Called when the card body is clicked.
   * When provided, overrides the default AnalysisPanel behavior.
   * (Legacy prop — kept for backward compatibility.)
   */
  onClick?: (code: string) => void
  className?: string
}

export default function Card({
  code,
  name,
  value,
  delta,
  deltaDirection,
  category,
  unit,
  source,
  frequency,
  lastUpdate,
  pinned = false,
  sparklineValues = [],
  sparklineDates,
  onPin,
  onClick,
  className,
}: CardProps) {
  const [openInfo, setOpenInfo] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const articleRef = useRef<HTMLElement>(null)

  const displayValue = value !== null && value !== undefined
    ? formatNumber(value)
    : '—'

  const hasDelta = delta !== undefined
  const [unitCore, unitQualifier] = splitUnit(unit)
  const freqCode = frequencyPill(frequency)

  // Close popover on outside mousedown
  useEffect(() => {
    if (!openInfo) return

    function handleOutside(e: MouseEvent) {
      if (articleRef.current && !articleRef.current.contains(e.target as Node)) {
        setOpenInfo(false)
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenInfo(false)
    }

    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openInfo])

  function handlePinClick(e: React.MouseEvent) {
    e.stopPropagation()
    onPin?.(code)
  }

  function handleInfoClick(e: React.MouseEvent) {
    e.stopPropagation()
    setOpenInfo((v) => !v)
  }

  function handleCardClick() {
    if (onClick) {
      onClick(code)
    } else {
      setPanelOpen(true)
    }
  }

  return (
    <>
      <article
        ref={articleRef}
        className={[styles.card, className].filter(Boolean).join(' ')}
        onClick={handleCardClick}
        data-testid="card"
        data-code={code}
        aria-label={`${name} — ${displayValue}${unit ? ' ' + unit : ''}`}
        style={{
          // Category cue: thin colored stripe on the left edge of the card.
          // Keeps the semantic without adding a text chip in the header.
          borderLeft: category ? `3px solid ${categoryColor(category)}` : undefined,
        }}
      >
        {/* Header: code + icons. Category cue lives on the card's left edge. */}
        <div className={styles.header}>
          <span className={styles.code}>{code}</span>

          <div className={styles.headerActions}>
            {/* Info icon button */}
            <button
              className={styles.infoBtn}
              onClick={handleInfoClick}
              aria-label={`Mais informações sobre ${code}`}
              aria-expanded={openInfo}
              data-testid="card-info-btn"
              type="button"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <circle cx="7" cy="7" r="6.25" stroke="currentColor" strokeWidth="1.5" />
                <rect x="6.25" y="6" width="1.5" height="4.5" rx="0.75" fill="currentColor" />
                <circle cx="7" cy="3.75" r="0.875" fill="currentColor" />
              </svg>
            </button>

            {/* Pin star — SVG for consistent sizing with info icon */}
            <button
              className={[styles.starBtn, pinned ? styles.pinned : ''].filter(Boolean).join(' ')}
              onClick={handlePinClick}
              aria-label={pinned ? `Desafixar ${code}` : `Fixar ${code} no Painel`}
              aria-pressed={pinned}
              data-testid="card-pin-btn"
              type="button"
            >
              {pinned ? (
                <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 1.5L9.796 5.63L14.292 6.17L11.146 9.09L11.98 13.5L8 11.27L4.02 13.5L4.854 9.09L1.708 6.17L6.204 5.63L8 1.5Z" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
                  <path d="M8 1.5L9.796 5.63L14.292 6.17L11.146 9.09L11.98 13.5L8 11.27L4.02 13.5L4.854 9.09L1.708 6.17L6.204 5.63L8 1.5Z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Info popover — name, source, freq, date */}
        {openInfo && (
          <div
            className={styles.popover}
            role="tooltip"
            data-testid="card-info-popover"
          >
            <p className={styles.popoverName}>{name}</p>
            <dl className={styles.popoverMeta}>
              {source && (
                <>
                  <dt>Fonte</dt>
                  <dd>{source}</dd>
                </>
              )}
              {frequency && (
                <>
                  <dt>Frequência</dt>
                  <dd>{frequency}</dd>
                </>
              )}
              {lastUpdate && (
                <>
                  <dt>Última atualização</dt>
                  <dd>{formatDate(lastUpdate)}</dd>
                </>
              )}
            </dl>
          </div>
        )}

        {/* Hero value — number + small unit slot. Long-tail qualifier
            (e.g. "preços 1995") moves into the unit's title tooltip
            so it's accessible without crowding the card. */}
        <div className={styles.valueRow}>
          <span className={styles.value} data-testid="card-value">
            {displayValue}
          </span>
          {unitCore && (
            <span
              className={styles.unit}
              title={unitQualifier ?? undefined}
            >
              {unitCore}
            </span>
          )}
        </div>

        {/* Delta — unit dropped (already shown above) */}
        {hasDelta && (
          <div className={styles.deltaRow}>
            <DeltaBadge
              value={delta ?? 0}
              category={category}
              direction={deltaDirection}
            />
          </div>
        )}

        {/* Sparkline — tinted by delta direction */}
        {sparklineValues.length >= 2 && (
          <div className={styles.sparklineArea}>
            <Sparkline
              values={sparklineValues}
              dates={sparklineDates}
              width={160}
              height={28}
              color={category ? categoryColor(category) : undefined}
              unit={unitCore}
            />
          </div>
        )}

        {/* Footer: relative date + freq pill. Source lives in the info
            popover (ⓘ) and grouped headings on Indices — pulled from the
            card body to reduce visual noise. */}
        <div className={styles.metaRow}>
          {lastUpdate && (
            <span
              className={styles.dateRel}
              title={`${formatDate(lastUpdate)}${source ? ' · ' + source : ''}`}
            >
              {relativeDate(lastUpdate, frequency)}
            </span>
          )}
          {freqCode && (
            <span className={styles.freqPill} title={frequency}>
              {freqCode}
            </span>
          )}
        </div>
      </article>

      {/* AnalysisPanel — opened on card body click */}
      <AnalysisPanel
        series={{ code, name, unit, category }}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
      />
    </>
  )
}
