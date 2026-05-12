/**
 * RefreshButton — manual extraction trigger.
 *
 * If `code` is provided: calls POST /admin/extract/{code}.
 * If `code` is omitted:  calls POST /admin/backfill (all 25 series).
 *
 * Visual states:
 *   - idle      → label "Atualizar"
 *   - loading   → label "Atualizando…" with spinner
 *   - success   → "✓ atualizado" for 2.5s, then back to idle
 *   - error     → "× falha" for 2.5s, then back to idle
 */

import { useEffect, useState } from 'react'
import { useBackfill, useExtractOne } from '@/hooks/useAdmin'
import styles from './RefreshButton.module.css'

export interface RefreshButtonProps {
  /** Optional series code. When set, refreshes only that series. */
  code?: string
  /** Custom label override. Defaults to "Atualizar". */
  label?: string
}

export default function RefreshButton({ code, label = 'Atualizar' }: RefreshButtonProps) {
  const backfill = useBackfill()
  const extractOne = useExtractOne()

  // We coordinate from whichever mutation is active.
  const mutation = code ? extractOne : backfill
  const [flash, setFlash] = useState<'ok' | 'err' | null>(null)

  useEffect(() => {
    if (mutation.isSuccess) {
      setFlash('ok')
      const t = window.setTimeout(() => setFlash(null), 2500)
      return () => window.clearTimeout(t)
    }
    if (mutation.isError) {
      setFlash('err')
      const t = window.setTimeout(() => setFlash(null), 2500)
      return () => window.clearTimeout(t)
    }
    return undefined
  }, [mutation.isSuccess, mutation.isError])

  function handleClick() {
    if (code) {
      extractOne.mutate(code)
    } else {
      backfill.mutate(undefined)
    }
  }

  const isLoading = mutation.isPending
  let text = label
  if (isLoading) text = 'Atualizando…'
  else if (flash === 'ok') text = '✓ atualizado'
  else if (flash === 'err') text = '× falha'

  return (
    <button
      type="button"
      className={styles.button}
      onClick={handleClick}
      disabled={isLoading}
      aria-busy={isLoading}
      data-testid="refresh-button"
      data-flash={flash ?? undefined}
    >
      {isLoading && <span className={styles.spinner} aria-hidden="true" />}
      <span className={styles.text}>{text}</span>
    </button>
  )
}
