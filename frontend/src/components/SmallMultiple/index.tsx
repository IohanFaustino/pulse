/**
 * SmallMultiple — dense Painel card variant for pinned series.
 *
 * Layout: code + source / sparkline / value + delta (+ transform badge if active)
 * Hover reveals: unpin button (right, gold ★) + modify button (left, pencil icon)
 * Clicking the card body (not the action buttons) opens AnalysisPanel.
 */

import { useState } from 'react'
import styles from './SmallMultiple.module.css'
import DeltaBadge from '@/components/DeltaBadge'
import Sparkline from '@/components/Sparkline'
import AnalysisPanel from '@/components/AnalysisPanel'
import { formatNumber } from '@/lib/formatPtBR'
import type { DeltaDirection } from '@/lib/deltaSemantics'

export interface SmallMultipleProps {
  code: string
  name: string
  value: number | null
  delta?: number
  deltaDirection?: DeltaDirection
  category: string
  unit?: string
  source?: string
  sparklineValues?: (number | null)[]
  /** Active transform op name, e.g. 'yoy' — shown as badge when set. */
  activeTransform?: string
  onUnpin?: (code: string) => void
  onModify?: (code: string) => void
  /** Optional click override — defaults to opening AnalysisPanel */
  onClick?: (code: string) => void
  className?: string
}

export default function SmallMultiple({
  code,
  name,
  value,
  delta,
  deltaDirection,
  category,
  unit,
  source,
  sparklineValues = [],
  activeTransform,
  onUnpin,
  onModify,
  onClick,
  className,
}: SmallMultipleProps) {
  const [panelOpen, setPanelOpen] = useState(false)

  const displayValue = value !== null && value !== undefined
    ? formatNumber(value)
    : '—'

  const hasDelta = delta !== undefined

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
        className={[styles.card, className].filter(Boolean).join(' ')}
        data-testid="small-multiple"
        data-code={code}
        aria-label={`${name} — ${displayValue}${unit ? ' ' + unit : ''}`}
        onClick={handleCardClick}
        style={{ cursor: 'pointer' }}
      >
        {/* Hover action overlay */}
        <div className={styles.actions} data-testid="sm-actions">
          <button
            className={[styles.actionBtn, styles.modifyBtn].join(' ')}
            onClick={(e) => { e.stopPropagation(); onModify?.(code) }}
            aria-label={`Modificar transformação de ${code}`}
            data-testid="sm-modify-btn"
            type="button"
          >
            ✎
          </button>
          <button
            className={[styles.actionBtn, styles.unpinBtn].join(' ')}
            onClick={(e) => { e.stopPropagation(); onUnpin?.(code) }}
            aria-label={`Desafixar ${code} do Painel`}
            data-testid="sm-unpin-btn"
            type="button"
          >
            ★
          </button>
        </div>

        {/* Header: code + unit (secondary) + source */}
        <div className={styles.header}>
          <div className={styles.codeGroup}>
            <span className={styles.code}>{code}</span>
            {unit && <span className={styles.unit}>{unit}</span>}
          </div>
          {source && <span className={styles.source}>{source}</span>}
        </div>

        {/* Value + delta — prominent data ink; unit no longer shown here */}
        <div className={styles.valueRow}>
          <span className={styles.value} data-testid="sm-value">
            {displayValue}
          </span>
          {hasDelta && (
            <DeltaBadge
              value={delta ?? 0}
              category={category}
              direction={deltaDirection}
            />
          )}
        </div>

        {/* Transform badge */}
        {activeTransform && (
          <span className={styles.transformBadge} data-testid="sm-transform-badge">
            {activeTransform}
          </span>
        )}

        {/* Sparkline — anchored at bottom, ambient trend context */}
        {sparklineValues.length >= 2 && (
          <div className={styles.sparklineRow}>
            <Sparkline values={sparklineValues} width={200} height={56} />
          </div>
        )}
      </article>

      {/* AnalysisPanel — opened on card body click */}
      <AnalysisPanel
        series={{ code, name }}
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
      />
    </>
  )
}
