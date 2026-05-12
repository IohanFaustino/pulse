/**
 * SyncIndicator — pulsing footer dot + relative time text.
 *
 * Reflects the minimum freshness across series:
 *   - status === 'ok'      → green dot, "sincronizado · {relative}"
 *   - status === 'pending' → yellow dot, "aguardando dados"
 *   - status === 'degraded'→ red dot,    "atrasado · {relative}"
 *
 * Animation reuses the Sidebar footer `.footerDot` pulse (CSS animation).
 */

import { useMemo } from 'react'
import { useHealth } from '@/hooks/useHealth'
import styles from './SyncIndicator.module.css'

/** pt-BR-formatted relative time from `now` back to `iso`. */
export function relativeTimePtBR(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'nunca'
  const then = new Date(iso)
  const diffMs = now.getTime() - then.getTime()
  if (Number.isNaN(diffMs)) return 'nunca'
  if (diffMs < 60_000) return 'agora'
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 60) return `há ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours}h`
  const days = Math.floor(hours / 24)
  return `há ${days}d`
}

export interface SyncIndicatorProps {
  /** Override the live useHealth() query — used by tests. */
  override?: { status: string; sync_at: string | null }
}

export default function SyncIndicator({ override }: SyncIndicatorProps) {
  const { data } = useHealth()

  const status = override?.status ?? data?.status ?? 'pending'
  const syncAt = override?.sync_at ?? data?.sync_at ?? null

  const dotClass = useMemo(() => {
    if (status === 'ok') return styles.dotOk
    if (status === 'pending') return styles.dotPending
    return styles.dotDegraded
  }, [status])

  const relative = relativeTimePtBR(syncAt)

  const label =
    status === 'pending'
      ? 'aguardando dados'
      : status === 'ok'
      ? `sincronizado · ${relative}`
      : `atrasado · ${relative}`

  return (
    <span className={styles.wrap} data-testid="sync-indicator" data-status={status}>
      <span className={`${styles.dot} ${dotClass}`} aria-hidden="true" />
      <span className={styles.text}>{label}</span>
    </span>
  )
}
