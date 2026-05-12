/**
 * AnalysisPanel — inline analysis overlay opened by clicking a card body.
 *
 * Renders as a portal (appended to document.body) with a scrim backdrop.
 * Contains:
 *   - Series title (code + name)
 *   - Accordion section "Transformação" — same radio groups as TransformModal
 *   - Accordion section "Formato do gráfico" — linha / barras / área
 *   - "Aplicar" button
 *   - After apply: animated Chart + "Salvar imagem" + "Salvar dados" buttons
 *
 * Closes on: Escape key, outside-click on scrim, X button.
 * Respects prefers-reduced-motion.
 */

import { useState, useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import styles from './AnalysisPanel.module.css'
import Chart, { type ChartFormat, type ChartDataPoint, type ChartHandle } from '@/components/Chart'
import { useTransformMutation } from '@/hooks/useTransform'
import { useTranslation } from '@/lib/i18n'
import { exportSvgToPng } from '@/lib/exportSvg'
import { exportCsv } from '@/lib/exportCsv'
import type { TransformSpec } from '@/hooks/useTransform'
import { categoryColor } from '@/lib/categoryColor'
import { splitUnit } from '@/lib/formatPtBR'

// ── Transform option definitions (mirrors TransformModal) ─────────────────────

/** Op codes only — labels resolved via i18n (`analysis.op.<op>`). */
const GROUP_ORIGINAL = ['level', 'sa', 'calendar_adj'] as const
const GROUP_VARIACAO = ['mom', 'qoq', 'yoy', 'annualized', 'diff', 'log_diff', 'pp'] as const
const GROUP_SUAVIZACAO = ['ma_3', 'ma_6', 'ma_12', 'ewma'] as const
const GROUP_JANELAS = ['accum12', 'stddev12'] as const
const GROUP_NORMALIZACAO = ['rebase', 'zscore', 'percentile'] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function opToSpec(op: string, ewmaSpan: number, rebaseBase: number): TransformSpec {
  if (op === 'ma_3') return { op: 'ma', params: { window: 3 } }
  if (op === 'ma_6') return { op: 'ma', params: { window: 6 } }
  if (op === 'ma_12') return { op: 'ma', params: { window: 12 } }
  if (op === 'ewma') return { op: 'ewma', params: { span: ewmaSpan } }
  if (op === 'rebase') return { op: 'rebase', params: { base: rebaseBase } }
  return { op }
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AnalysisPanelSeries {
  code: string
  name: string
  /** Optional — unit suffix shown in chart hover tooltip */
  unit?: string
  /** Optional — category drives chart line/bar colour */
  category?: string
}

interface AnalysisPanelProps {
  series: AnalysisPanelSeries
  open: boolean
  onClose: () => void
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AnalysisPanel({ series, open, onClose }: AnalysisPanelProps) {
  const id = useId()
  const chartRef = useRef<ChartHandle>(null)
  const { t } = useTranslation()

  // Transform state
  const [selectedOp, setSelectedOp] = useState<string>('level')
  const [ewmaSpan, setEwmaSpan] = useState<number>(12)
  const [rebaseBase, setRebaseBase] = useState<number>(100)

  // Accordion state
  const [transformOpen, setTransformOpen] = useState(true)
  const [formatOpen, setFormatOpen] = useState(true)

  // Format state
  const [format, setFormat] = useState<ChartFormat>('line')

  // Applied result state
  const [chartData, setChartData] = useState<ChartDataPoint[] | null>(null)
  const [appliedOp, setAppliedOp] = useState<string>('level')

  // Mutation
  const mutation = useTransformMutation(series.code)

  // Close on Escape · Apply on Enter (when not typing in a number input)
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter') {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return
        e.preventDefault()
        handleApply()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, selectedOp, ewmaSpan, rebaseBase])

  // Reset state when panel opens for a new series
  useEffect(() => {
    if (open) {
      setSelectedOp('level')
      setChartData(null)
      setFormat('line')
      setTransformOpen(true)
      setFormatOpen(true)
    }
  }, [open, series.code])

  if (!open) return null

  function handleApply() {
    const spec = opToSpec(selectedOp, ewmaSpan, rebaseBase)
    mutation.mutate(spec, {
      onSuccess: (data) => {
        // API returns { values: [{date, value}], metadata: {...} }
        const points: ChartDataPoint[] = (data.values ?? [])
          .filter((item) => item.value !== null && Number.isFinite(item.value as number))
          .map((item) => ({
            date: (item.date as string).slice(0, 10),
            value: item.value as number,
          }))
        setChartData(points)
        setAppliedOp(selectedOp)
      },
    })
  }

  async function handleSaveImage() {
    const svgEl = chartRef.current?.svgElement
    if (!svgEl) return
    await exportSvgToPng(svgEl, `${series.code}_${appliedOp}.png`)
  }

  function handleSaveData() {
    if (!chartData) return
    exportCsv(chartData, `${series.code}_${appliedOp}.csv`)
  }

  function renderGroup(groupKey: string, ops: readonly string[], testId: string) {
    return (
      <fieldset className={styles.group} data-testid={testId}>
        <legend className={styles.groupLabel}>{t(groupKey)}</legend>
        <div className={styles.options}>
          {ops.map((op) => {
            const inputId = `${id}-${op}`
            return (
              <label key={op} className={styles.option} htmlFor={inputId}>
                <input
                  type="radio"
                  id={inputId}
                  name={`${id}-transform`}
                  value={op}
                  checked={selectedOp === op}
                  onChange={() => setSelectedOp(op)}
                  data-testid={`ap-radio-${op}`}
                />
                <span className={styles.optionLabel}>{t(`analysis.op.${op}`)}</span>
              </label>
            )
          })}
        </div>

        {groupKey === 'analysis.group.suavizacao' && selectedOp === 'ewma' && (
          <div className={styles.paramRow}>
            <label className={styles.paramLabel} htmlFor={`${id}-ewma-span`}>
              span
            </label>
            <input
              id={`${id}-ewma-span`}
              className={styles.paramInput}
              type="number"
              min={2}
              max={60}
              value={ewmaSpan}
              onChange={(e) => setEwmaSpan(Number(e.target.value))}
              data-testid="ap-ewma-span"
            />
          </div>
        )}
        {groupKey === 'analysis.group.normalizacao' && selectedOp === 'rebase' && (
          <div className={styles.paramRow}>
            <label className={styles.paramLabel} htmlFor={`${id}-rebase-base`}>
              base
            </label>
            <input
              id={`${id}-rebase-base`}
              className={styles.paramInput}
              type="number"
              min={1}
              value={rebaseBase}
              onChange={(e) => setRebaseBase(Number(e.target.value))}
              data-testid="ap-rebase-base"
            />
          </div>
        )}
      </fieldset>
    )
  }

  const panel = (
    <div
      className={styles.scrim}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      data-testid="analysis-panel-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
    >
      <div className={styles.panel} data-testid="analysis-panel">
        {/* ── Header ── */}
        <header className={styles.header}>
          <div className={styles.headerText}>
            <p className={styles.kicker}>{t('analysis.kicker')}</p>
            <h2 id={`${id}-title`} className={styles.title}>
              <span className={styles.titleCode}>{series.code}</span>
              {' '}— {series.name}
            </h2>
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={t('analysis.btn.close')}
            data-testid="analysis-panel-close"
            type="button"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <line x1="1" y1="1" x2="13" y2="13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
              <line x1="13" y1="1" x2="1" y2="13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {/* ── Accordion: Transformação ── */}
        <div className={styles.accordion}>
          <button
            className={styles.accordionTrigger}
            onClick={() => setTransformOpen((v) => !v)}
            aria-expanded={transformOpen}
            data-testid="ap-accordion-transform"
            type="button"
          >
            {t('analysis.acc.transform')}
            <span
              className={[styles.chevron, transformOpen ? styles.open : ''].filter(Boolean).join(' ')}
              aria-hidden="true"
            >
              ›
            </span>
          </button>
          {transformOpen && (
            <div className={styles.accordionBody} data-testid="ap-transform-body">
              {renderGroup('analysis.group.original', GROUP_ORIGINAL, 'ap-group-original')}
              {renderGroup('analysis.group.variacao', GROUP_VARIACAO, 'ap-group-variacao')}
              {renderGroup('analysis.group.suavizacao', GROUP_SUAVIZACAO, 'ap-group-suavizacao')}
              {renderGroup('analysis.group.janelas', GROUP_JANELAS, 'ap-group-janelas')}
              {renderGroup('analysis.group.normalizacao', GROUP_NORMALIZACAO, 'ap-group-normalizacao')}
            </div>
          )}
        </div>

        {/* ── Accordion: Formato do gráfico ── */}
        <div className={styles.accordion}>
          <button
            className={styles.accordionTrigger}
            onClick={() => setFormatOpen((v) => !v)}
            aria-expanded={formatOpen}
            data-testid="ap-accordion-format"
            type="button"
          >
            {t('analysis.acc.format')}
            <span
              className={[styles.chevron, formatOpen ? styles.open : ''].filter(Boolean).join(' ')}
              aria-hidden="true"
            >
              ›
            </span>
          </button>
          {formatOpen && (
            <div className={styles.accordionBody} data-testid="ap-format-body">
              <div className={styles.options}>
                {(['line', 'bar', 'area'] as ChartFormat[]).map((f) => {
                  const labels: Record<ChartFormat, string> = {
                    line: t('analysis.format.line'),
                    bar: t('analysis.format.bar'),
                    area: t('analysis.format.area'),
                  }
                  return (
                    <label key={f} className={styles.option} htmlFor={`${id}-format-${f}`}>
                      <input
                        type="radio"
                        id={`${id}-format-${f}`}
                        name={`${id}-format`}
                        value={f}
                        checked={format === f}
                        onChange={() => setFormat(f)}
                        data-testid={`ap-format-${f}`}
                      />
                      <span className={styles.optionLabel}>{labels[f]}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer: Limpar · kbd hint · Aplicar ── */}
        <div className={styles.applyRow}>
          <button
            className={styles.clearBtn}
            onClick={() => {
              setSelectedOp('level')
              setFormat('line')
              setChartData(null)
            }}
            disabled={selectedOp === 'level' && format === 'line' && !chartData}
            data-testid="ap-clear-btn"
            type="button"
          >
            {t('analysis.btn.clear')}
          </button>

          {mutation.isError && (
            <p className={styles.errorMsg} role="alert">
              {t('analysis.error.transform')}
            </p>
          )}

          <span className={styles.kbdHint} aria-hidden="true">
            <kbd>Esc</kbd> {t('analysis.kbd.esc')}
            <kbd>Enter</kbd> {t('analysis.kbd.enter')}
          </span>

          <button
            className={styles.applyBtn}
            onClick={handleApply}
            disabled={mutation.isPending}
            data-testid="ap-apply-btn"
            type="button"
          >
            {mutation.isPending ? t('analysis.btn.applying') : t('analysis.btn.apply')}
          </button>
        </div>

        {/* ── Chart result ── */}
        {chartData && (
          <div className={styles.chartSection} data-testid="ap-chart-section">
            <Chart
              ref={chartRef}
              data={chartData}
              format={format}
              width={560}
              height={260}
              unit={series.unit ? splitUnit(series.unit)[0] : undefined}
              color={series.category ? categoryColor(series.category) : undefined}
            />
            <div className={styles.exportRow}>
              <button
                className={styles.exportBtn}
                onClick={handleSaveImage}
                data-testid="ap-save-image"
                type="button"
              >
                {t('analysis.btn.saveImage')}
              </button>
              <button
                className={styles.exportBtn}
                onClick={handleSaveData}
                data-testid="ap-save-data"
                type="button"
              >
                {t('analysis.btn.saveData')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return createPortal(panel, document.body)
}
