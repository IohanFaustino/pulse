/**
 * TransformModal — 5-group transform selector for a pinned series.
 *
 * Groups (per doc §7):
 *   1. Série original — level, sa, calendar_adj
 *   2. Variação      — mom, qoq, yoy, annualized, diff, log_diff, pp
 *   3. Suavização    — ma (window 3/6/12), ewma (span input)
 *   4. Janelas       — accum12, stddev12
 *   5. Normalização  — rebase (base=100), zscore, percentile
 *
 * Motion: scrim fade 160ms, card translateY(8px)+scale(0.98)→0 in 220ms (CSS).
 * Emits: onApply(TransformSpec) | onCancel()
 */

import { useState, useEffect, useId } from 'react'
import { createPortal } from 'react-dom'
import styles from './TransformModal.module.css'
import type { TransformSpec } from '@/hooks/useTransform'

export type { TransformSpec }

// ── Option definitions ────────────────────────────────────────────────────────

interface OptionDef {
  op: string
  label: string
}

const GROUP_ORIGINAL: OptionDef[] = [
  { op: 'level',        label: 'Nível (original)' },
  { op: 'sa',           label: 'Dessazonalizado' },
  { op: 'calendar_adj', label: 'Ajuste de calendário' },
]

const GROUP_VARIACAO: OptionDef[] = [
  { op: 'mom',        label: 'MoM — variação mensal' },
  { op: 'qoq',        label: 'QoQ — variação trimestral' },
  { op: 'yoy',        label: 'YoY — variação anual' },
  { op: 'annualized', label: 'Anualizada' },
  { op: 'diff',       label: 'Primeira diferença' },
  { op: 'log_diff',   label: 'Log-diferença' },
  { op: 'pp',         label: 'Pontos percentuais' },
]

const GROUP_SUAVIZACAO: OptionDef[] = [
  { op: 'ma_3',   label: 'Média móvel 3m' },
  { op: 'ma_6',   label: 'Média móvel 6m' },
  { op: 'ma_12',  label: 'Média móvel 12m' },
  { op: 'ewma',   label: 'EWMA (span)' },
]

const GROUP_JANELAS: OptionDef[] = [
  { op: 'accum12',  label: 'Acumulado 12m' },
  { op: 'stddev12', label: 'Desvio-padrão 12m' },
]

const GROUP_NORMALIZACAO: OptionDef[] = [
  { op: 'rebase',     label: 'Rebase = 100' },
  { op: 'zscore',     label: 'Z-score' },
  { op: 'percentile', label: 'Percentil' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function opToSpec(op: string, ewmaSpan: number, rebaseBase: number): TransformSpec {
  if (op === 'ma_3') return { op: 'ma', params: { window: 3 } }
  if (op === 'ma_6') return { op: 'ma', params: { window: 6 } }
  if (op === 'ma_12') return { op: 'ma', params: { window: 12 } }
  if (op === 'ewma') return { op: 'ewma', params: { span: ewmaSpan } }
  if (op === 'rebase') return { op: 'rebase', params: { base: rebaseBase } }
  return { op }
}

function specToInternalOp(spec: TransformSpec): string {
  if (spec.op === 'ma') {
    const w = (spec.params as { window?: number } | undefined)?.window ?? 12
    return `ma_${w}`
  }
  return spec.op
}

// ── Component ─────────────────────────────────────────────────────────────────

interface TransformModalProps {
  /** Series code shown in the header. */
  code: string
  /** Series name shown in the header. */
  name: string
  /** Currently active transform spec (used to pre-select). */
  currentSpec?: TransformSpec | null
  /** Called with the selected spec when "Aplicar transformação" is clicked. */
  onApply: (spec: TransformSpec) => void
  /** Called when "Cancelar" is clicked or backdrop is clicked. */
  onCancel: () => void
}

export default function TransformModal({
  code,
  name,
  currentSpec,
  onApply,
  onCancel,
}: TransformModalProps) {
  const id = useId()

  const initialOp = currentSpec ? specToInternalOp(currentSpec) : 'level'
  const [selectedOp, setSelectedOp] = useState<string>(initialOp)
  const [ewmaSpan, setEwmaSpan] = useState<number>(12)
  const [rebaseBase, setRebaseBase] = useState<number>(100)

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  function handleApply() {
    const spec = opToSpec(selectedOp, ewmaSpan, rebaseBase)
    onApply(spec)
  }

  function renderGroup(
    groupLabel: string,
    options: OptionDef[],
    testId: string,
  ) {
    return (
      <fieldset className={styles.group} data-testid={testId}>
        <legend className={styles.groupLabel}>{groupLabel}</legend>
        <div className={styles.options}>
          {options.map((opt) => {
            const inputId = `${id}-${opt.op}`
            return (
              <label key={opt.op} className={styles.option} htmlFor={inputId}>
                <input
                  type="radio"
                  id={inputId}
                  name={`${id}-transform`}
                  value={opt.op}
                  checked={selectedOp === opt.op}
                  onChange={() => setSelectedOp(opt.op)}
                  data-testid={`radio-${opt.op}`}
                />
                <span className={styles.optionLabel}>{opt.label}</span>
              </label>
            )
          })}
        </div>

        {/* Conditional param inputs */}
        {groupLabel === 'Suavização' && selectedOp === 'ewma' && (
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
              data-testid="ewma-span-input"
            />
          </div>
        )}
        {groupLabel === 'Normalização' && selectedOp === 'rebase' && (
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
              data-testid="rebase-base-input"
            />
          </div>
        )}
      </fieldset>
    )
  }

  const modal = (
    <div
      className={styles.scrim}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
      data-testid="transform-modal-scrim"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
    >
      <div className={styles.modal} data-testid="transform-modal">
        {/* Header */}
        <header className={styles.header}>
          <p className={styles.kicker}>Transformação</p>
          <h2 id={`${id}-title`} className={styles.title}>
            <span className={styles.titleCode}>{code}</span>
            {' '}— {name}
          </h2>
          <p className={styles.lede}>
            Escolha como transformar os dados desta série no Painel.
            A transformação é aplicada apenas à visualização.
          </p>
        </header>

        {/* Body */}
        <div className={styles.body}>
          {renderGroup('Série original', GROUP_ORIGINAL, 'group-original')}
          {renderGroup('Variação', GROUP_VARIACAO, 'group-variacao')}
          {renderGroup('Suavização', GROUP_SUAVIZACAO, 'group-suavizacao')}
          {renderGroup('Janelas', GROUP_JANELAS, 'group-janelas')}
          {renderGroup('Normalização', GROUP_NORMALIZACAO, 'group-normalizacao')}
        </div>

        {/* Footer */}
        <footer className={styles.footer}>
          <button
            className={styles.cancelBtn}
            onClick={onCancel}
            data-testid="modal-cancel-btn"
            type="button"
          >
            Cancelar
          </button>
          <button
            className={styles.applyBtn}
            onClick={handleApply}
            data-testid="modal-apply-btn"
            type="button"
          >
            Aplicar transformação
          </button>
        </footer>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
