/**
 * CalendarStrip — horizontal 14-day strip of upcoming release events.
 *
 * Used in the Painel page below the small-multiples grid.
 * Shows one column per day with release chips (E=expected, R=realized).
 *
 * Props:
 *   releases — ReleaseRead[] from GET /releases
 *   startDate — first day of the strip (defaults to today)
 */

import styles from './CalendarStrip.module.css'
import { formatWeekday, formatDayNumber } from '@/lib/formatPtBR'
import type { components } from '@/api/schema'

export type ReleaseRead = components['schemas']['ReleaseRead']

const STRIP_DAYS = 30

interface CalendarStripProps {
  releases: ReleaseRead[]
  /** ISO date string for the first day. Defaults to today. */
  startDate?: string
  className?: string
}

export default function CalendarStrip({
  releases,
  startDate,
  className,
}: CalendarStripProps) {
  // Build array of 14 Date objects starting from startDate or today
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const start = startDate ? (() => {
    const [y, m, d] = startDate.split('-').map(Number)
    return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1)
  })() : today

  const days: Date[] = Array.from({ length: STRIP_DAYS }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    return d
  })

  // Index releases by their scheduled_for date string (YYYY-MM-DD)
  const releasesByDate = new Map<string, ReleaseRead[]>()
  for (const rel of releases) {
    const existing = releasesByDate.get(rel.scheduled_for) ?? []
    releasesByDate.set(rel.scheduled_for, [...existing, rel])
  }

  function toISODate(d: Date): string {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  function isToday(d: Date): boolean {
    return toISODate(d) === toISODate(today)
  }

  function isWeekend(d: Date): boolean {
    return d.getDay() === 0 || d.getDay() === 6
  }

  return (
    <div
      className={[styles.strip, className].filter(Boolean).join(' ')}
      data-testid="calendar-strip"
      role="list"
      aria-label="Próximas divulgações — 30 dias"
    >
      {days.map((day) => {
        const iso = toISODate(day)
        const dayReleases = releasesByDate.get(iso) ?? []
        const todayClass = isToday(day) ? styles.today : ''
        const weekendClass = isWeekend(day) ? styles.weekend : ''

        return (
          <div
            key={iso}
            className={[styles.day, todayClass, weekendClass].filter(Boolean).join(' ')}
            data-testid="calendar-strip-day"
            data-date={iso}
            role="listitem"
          >
            <div className={styles.dayHeader}>
              <span className={styles.dayWeekday}>
                {formatWeekday(day)}
              </span>
              <span className={styles.dayNumber}>
                {formatDayNumber(day)}
              </span>
            </div>

            {dayReleases.length > 0 && (
              <div className={styles.releases}>
                {dayReleases.map((rel) => (
                  <span
                    key={rel.id}
                    className={[
                      styles.releaseChip,
                      rel.status === 'expected' ? styles.expected : styles.realized,
                    ].join(' ')}
                    title={rel.series_code}
                    data-testid="calendar-release-chip"
                  >
                    <span className={styles.releaseStatus}>
                      {rel.status === 'expected' ? 'E' : 'R'}
                    </span>
                    {rel.series_code}
                  </span>
                ))}
              </div>
            )}

            {dayReleases.length === 0 && (
              <div className={styles.emptyDay} aria-hidden="true" />
            )}
          </div>
        )
      })}
    </div>
  )
}
