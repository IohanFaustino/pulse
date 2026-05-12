/**
 * EmptyState — used by Painel (nothing pinned) and Índices (all pinned).
 *
 * Props:
 *   icon     — Unicode emoji / text icon
 *   title    — Primary message (serif)
 *   subtitle — Supporting description
 *   ctaLabel — CTA button label (optional)
 *   onAction — CTA click handler (optional)
 */

import styles from './EmptyState.module.css'

interface EmptyStateProps {
  /** Unicode character or short emoji to display as icon. */
  icon?: string
  /** Main heading text. */
  title: string
  /** Supporting detail text. */
  subtitle?: string
  /** Label for the call-to-action button. Omit to hide button. */
  ctaLabel?: string
  /** Handler fired when CTA is clicked. */
  onAction?: () => void
  className?: string
}

export default function EmptyState({
  icon = '○',
  title,
  subtitle,
  ctaLabel,
  onAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={[styles.container, className].filter(Boolean).join(' ')}
      data-testid="empty-state"
      role="status"
    >
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>

      <p className={styles.title}>{title}</p>

      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}

      {ctaLabel && (
        <button
          className={styles.cta}
          onClick={onAction}
          data-testid="empty-state-cta"
          type="button"
        >
          {ctaLabel}
        </button>
      )}
    </div>
  )
}
