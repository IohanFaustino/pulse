/**
 * CategoryToggle — pill "Mostrando · X ›" that expands chips BELOW the pill.
 *
 * Collapsed: shows a dark pill label with chevron.
 * Expanded: chips appear in a row below the pill (wrapping to multi-line if needed).
 * Chips animate in with a height-expand + staggered entrance.
 * Selecting a chip fires onSelect(category).
 */

import { useState, useEffect, useRef } from 'react'
import styles from './CategoryToggle.module.css'

export const CATEGORIES = [
  'Todos',
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

export type CategoryOption = (typeof CATEGORIES)[number]

interface CategoryToggleProps {
  /** Currently selected category. */
  selected: CategoryOption
  /** Called when user picks a category chip. */
  onSelect: (category: CategoryOption) => void
  /** Total number of series being shown (used in pill label). */
  totalCount?: number
  /** Pill label prefix — defaults to "Mostrando". e.g. "Categoria · Todos". */
  label?: string
  className?: string
}

export default function CategoryToggle({
  selected,
  onSelect,
  totalCount,
  label = 'Mostrando',
  className,
}: CategoryToggleProps) {
  const [expanded, setExpanded] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Close on outside-click + Escape
  useEffect(() => {
    if (!expanded) return
    function onPointer(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setExpanded(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [expanded])

  const pillLabel =
    totalCount !== undefined
      ? `${label} · ${totalCount}`
      : `${label} · ${selected}`

  function handlePillClick() {
    setExpanded((prev) => !prev)
  }

  function handleChipClick(cat: CategoryOption) {
    onSelect(cat)
    setExpanded(false)
  }

  return (
    <div
      ref={wrapperRef}
      className={[styles.wrapper, className].filter(Boolean).join(' ')}
      data-testid="category-toggle"
    >
      {/* Pill trigger */}
      <button
        className={styles.pill}
        onClick={handlePillClick}
        aria-expanded={expanded}
        aria-haspopup="listbox"
        data-testid="category-toggle-pill"
        type="button"
      >
        {pillLabel}
        <span
          className={[styles.chevron, expanded ? styles.open : ''].filter(Boolean).join(' ')}
          aria-hidden="true"
        >
          ›
        </span>
      </button>

      {/* Chips expand BELOW the pill */}
      {expanded && (
        <div
          className={styles.chipRow}
          role="listbox"
          aria-label="Categorias"
          data-testid="category-chips"
        >
          {CATEGORIES.map((cat, i) => (
            <button
              key={cat}
              role="option"
              aria-selected={cat === selected}
              className={[styles.chip, cat === selected ? styles.selected : ''].filter(Boolean).join(' ')}
              style={{ animationDelay: `${i * 18}ms` }}
              onClick={() => handleChipClick(cat)}
              data-testid={`category-chip-${cat}`}
              type="button"
            >
              {cat}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
