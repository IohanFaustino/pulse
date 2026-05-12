/**
 * Calendário page — W4b full implementation.
 *
 * 7-column monthly grid of economic indicator release events.
 * E = expected (future, green), R = realized (past, red).
 * Daily-frequency series excluded by the API (FR-6.7).
 */

import { useState, useMemo, useCallback } from 'react'
import CategoryToggle, {
  CATEGORIES,
  type CategoryOption,
} from '@/components/CategoryToggle'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import EmptyState from '@/components/EmptyState'
import DailyTable from '@/components/DailyTable'
import DayDetailModal from '@/components/DayDetailModal'
import { useReleases, type ReleaseRead } from '@/hooks/useReleases'
import { useSeries } from '@/hooks/useSeries'
import { categoryColor } from '@/lib/categoryColor'
import { greeting } from '@/lib/formatPtBR'
import { useTranslation } from '@/lib/i18n'
import styles from './Calendario.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert a Date to "YYYY-MM" string for the API month param.
 */
function toYYYYMM(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * Parse an ISO date string ("YYYY-MM-DD") as local midnight.
 * Avoids UTC-offset shift on date-only strings.
 */
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1)
}

/**
 * Format a Date as "YYYY-MM-DD" key for Map lookups.
 */
function toDateKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const DAY_HEADERS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'] as const

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril',
  'Maio', 'Junho', 'Julho', 'Agosto',
  'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const

/** Threshold: cells with more than this many releases collapse to 1 chip + overflow button. */
const CHIP_THRESHOLD = 3

// ── Month heading formatter ───────────────────────────────────────────────────

const monthYearFmt = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
})

function formatMonthHeading(date: Date): string {
  // Capitalise first letter (pt-BR months are lowercase by default)
  const raw = monthYearFmt.format(date)
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

// ── Grid builder ──────────────────────────────────────────────────────────────

interface CalendarCell {
  date: Date
  dayNumber: number
  dateKey: string
  isToday: boolean
  isWeekend: boolean
  isPast: boolean
  isPad: false
}

interface PadCell {
  isPad: true
  /** Day number from the adjacent (prev/next) month for spatial continuity. */
  dayNumber: number
}

type GridCell = CalendarCell | PadCell

function buildGrid(monthStart: Date, todayKey: string): GridCell[] {
  const year = monthStart.getFullYear()
  const month = monthStart.getMonth()

  const firstWeekday = new Date(year, month, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const cells: GridCell[] = []

  // Leading pad cells — render trailing days of previous month
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ isPad: true, dayNumber: daysInPrevMonth - firstWeekday + 1 + i })
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d)
    const dateKey = toDateKey(date)
    const dayOfWeek = date.getDay()
    cells.push({
      date,
      dayNumber: d,
      dateKey,
      isToday: dateKey === todayKey,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isPast: dateKey < todayKey,
      isPad: false,
    })
  }

  // Trailing pad cells — render leading days of next month
  const trailing = totalCells - cells.length
  for (let i = 0; i < trailing; i++) {
    cells.push({ isPad: true, dayNumber: i + 1 })
  }

  return cells
}

// ── Chip component ────────────────────────────────────────────────────────────

interface ChipProps {
  release: ReleaseRead
  category: string | undefined
  todayKey: string
}

function ReleaseChip({ release, category, todayKey }: ChipProps) {
  const dateKey = release.scheduled_for
  const isRealized =
    release.status === 'realized' || dateKey < todayKey
  const chipClass = isRealized ? styles.chipR : styles.chipE
  const label = isRealized ? 'R' : 'E'
  const codeColor = category ? categoryColor(category) : 'var(--ink)'

  return (
    <span
      className={`${styles.chip} ${chipClass}`}
      title={`${release.series_code} — ${isRealized ? 'realizado' : 'esperado'}`}
      data-testid="release-chip"
      data-status={label}
    >
      <span
        className={styles.chipCode}
        style={{ color: codeColor }}
      >
        {release.series_code}
      </span>
    </span>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Calendario() {
  // ── Local state ────────────────────────────────────────────────────────────

  const { t, lang } = useTranslation()

  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })

  const [activeCategory, setActiveCategory] = useState<CategoryOption>('Todos')

  // ── Day-detail modal state ─────────────────────────────────────────────────

  const [detailDate, setDetailDate] = useState<Date | null>(null)
  const [detailReleases, setDetailReleases] = useState<ReleaseRead[]>([])
  const [detailOpen, setDetailOpen] = useState(false)

  const openDetail = useCallback((date: Date, releases: ReleaseRead[]) => {
    setDetailDate(date)
    setDetailReleases(releases)
    setDetailOpen(true)
  }, [])

  const closeDetail = useCallback(() => {
    setDetailOpen(false)
  }, [])

  // ── Today reference ────────────────────────────────────────────────────────

  const todayKey = useMemo(() => toDateKey(new Date()), [])

  // ── Data fetching ──────────────────────────────────────────────────────────

  const monthParam = toYYYYMM(currentMonth)
  const categoryParam =
    activeCategory === 'Todos' ? undefined : activeCategory

  const {
    data: releasesData,
    isLoading: releasesLoading,
    isError: releasesError,
  } = useReleases({
    month: monthParam,
    category: categoryParam,
  })

  // Series list for category lookup (chip code colouring)
  const { data: seriesData } = useSeries()

  // ── Derived data ───────────────────────────────────────────────────────────

  /**
   * Map: series_code → category string
   * Used to colour chip codes by category.
   */
  const categoryByCode = useMemo<Map<string, string>>(() => {
    const map = new Map<string, string>()
    seriesData?.items.forEach((s) => {
      map.set(s.code, s.category)
    })
    return map
  }, [seriesData])

  /**
   * Map: dateKey → ReleaseRead[]
   */
  const releasesByDate = useMemo<Map<string, ReleaseRead[]>>(() => {
    const map = new Map<string, ReleaseRead[]>()
    releasesData?.items.forEach((r) => {
      const key = r.scheduled_for
      const existing = map.get(key)
      if (existing) {
        existing.push(r)
      } else {
        map.set(key, [r])
      }
    })
    return map
  }, [releasesData])

  /** E/R counters for the displayed month */
  const eCount = useMemo(
    () =>
      releasesData?.items.filter((r) => r.status === 'expected').length ?? 0,
    [releasesData]
  )
  const rCount = useMemo(
    () =>
      releasesData?.items.filter((r) => r.status === 'realized').length ?? 0,
    [releasesData]
  )

  /** Grid cells for the current month */
  const gridCells = useMemo(
    () => buildGrid(currentMonth, todayKey),
    [currentMonth, todayKey]
  )

  // ── Nav handlers ───────────────────────────────────────────────────────────

  function handlePrev() {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  function handleNext() {
    setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  function handleToday() {
    const now = new Date()
    setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1))
  }

  function handleCategorySelect(cat: CategoryOption) {
    setActiveCategory(cat)
  }

  const handleMonthSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setCurrentMonth(
        new Date(currentMonth.getFullYear(), Number(e.target.value), 1)
      )
    },
    [currentMonth]
  )

  const handleYearSelect = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setCurrentMonth(
        new Date(Number(e.target.value), currentMonth.getMonth(), 1)
      )
    },
    [currentMonth]
  )

  // ── Year range for selector ────────────────────────────────────────────────

  const years = useMemo(() => {
    const y = new Date().getFullYear()
    return Array.from({ length: 11 }, (_, i) => y - 5 + i)
  }, [])

  // ── Render ─────────────────────────────────────────────────────────────────

  const monthHeading = formatMonthHeading(currentMonth)

  return (
    <main className={styles.page} data-testid="page-calendario">
      {/* Greeting + legend with counters baked in */}
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <p className={styles.greeting}>{greeting(lang)}</p>
            <h1 className={styles.pageTitle}>{t('calendario.title')}</h1>
          </div>
          <div className={styles.legend} aria-label="Legenda">
            <span className={styles.legendE} data-testid="counter-e">
              <span className={styles.legendDot} data-type="E" />
              {t('calendario.counter.expected', { n: eCount })}
            </span>
            <span className={styles.legendR} data-testid="counter-r">
              <span className={styles.legendDot} data-type="R" />
              {t('calendario.counter.realized', { n: rCount })}
            </span>
          </div>
        </div>
      </header>

      {/* Single-row toolbar: prev · month/year · today · next · filter */}
      <nav className={styles.navBar} aria-label="Navegação do calendário">
        <button
          className={styles.navBtn}
          onClick={handlePrev}
          aria-label={t('calendario.nav.prev')}
          data-testid="nav-prev"
          type="button"
        >
          ‹
        </button>

        <div className={styles.navCenter}>
          {/* Visually-hidden span keeps existing nav-month-label tests passing */}
          <span
            className={styles.srOnly}
            data-testid="nav-month-label"
            aria-hidden="true"
          >
            {monthHeading}
          </span>

          <select
            className={styles.navSelect}
            value={currentMonth.getMonth()}
            onChange={handleMonthSelect}
            data-testid="nav-month-select"
            aria-label="Mês"
          >
            {MONTH_NAMES.map((name, idx) => (
              <option key={name} value={idx}>
                {name}
              </option>
            ))}
          </select>

          <select
            className={styles.navSelect}
            value={currentMonth.getFullYear()}
            onChange={handleYearSelect}
            data-testid="nav-year-select"
            aria-label="Ano"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <button
            className={styles.todayBtn}
            onClick={handleToday}
            data-testid="nav-today"
            type="button"
          >
            {t('calendario.today')}
          </button>
        </div>

        <button
          className={styles.navBtn}
          onClick={handleNext}
          aria-label={t('calendario.nav.next')}
          data-testid="nav-next"
          type="button"
        >
          ›
        </button>

        {/* Category filter inline at the right end of the toolbar */}
        <div className={styles.filterInline}>
          <CategoryToggle
            selected={activeCategory}
            onSelect={handleCategorySelect}
            label={t('calendario.filter.label')}
            data-testid="category-toggle"
          />
        </div>
      </nav>

      {/* Scrollable grid region: fixed-height page, header + nav stay in view. */}
      <div className={styles.scrollArea}>
      {/* Loading skeleton */}
      {releasesLoading && (
        <div className={styles.skeletonWrap} data-testid="calendar-skeleton">
          <div className={styles.grid}>
            {DAY_HEADERS.map((h) => (
              <div key={h} className={styles.dayHeader}>
                {h}
              </div>
            ))}
            {Array.from({ length: 35 }, (_, i) => (
              <div key={i} className={styles.cell}>
                <LoadingSkeleton.Rect height="0.75rem" width="1.5rem" />
                <LoadingSkeleton.Rect height="1.25rem" width="100%" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {releasesError && !releasesLoading && (
        <EmptyState
          icon="!"
          title={t('calendario.error.title')}
          subtitle={t('calendario.error.subtitle')}
        />
      )}

      {/* Calendar grid */}
      {!releasesLoading && !releasesError && (
        <>
          {releasesData?.items.length === 0 ? (
            <EmptyState
              icon="○"
              title={t('calendario.empty.title')}
              subtitle={
                activeCategory !== 'Todos'
                  ? t('calendario.empty.cat', { cat: activeCategory, month: monthHeading })
                  : t('calendario.empty.all', { month: monthHeading })
              }
            />
          ) : (
            <div
              className={styles.grid}
              role="grid"
              aria-label={`Grade do mês ${monthHeading}`}
              data-testid="calendar-grid"
            >
              {/* Column headers */}
              {DAY_HEADERS.map((h) => (
                <div
                  key={h}
                  className={styles.dayHeader}
                  role="columnheader"
                  data-testid="cal-col-header"
                >
                  {h}
                </div>
              ))}

              {/* Day cells */}
              {gridCells.map((cell, idx) => {
                if (cell.isPad) {
                  return (
                    <div
                      key={`pad-${idx}`}
                      className={`${styles.cell} ${styles.padCell}`}
                      aria-hidden="true"
                      data-testid="cal-pad-cell"
                    >
                      <span className={styles.padDayNumber}>{cell.dayNumber}</span>
                    </div>
                  )
                }

                const cellReleases = releasesByDate.get(cell.dateKey) ?? []
                const isCollapsed = cellReleases.length > CHIP_THRESHOLD
                const overflowCount = cellReleases.length - 1

                // Cells with ≥1 release are clickable — open detail modal
                const hasReleases = cellReleases.length > 0

                return (
                  <div
                    key={cell.dateKey}
                    className={[
                      styles.cell,
                      cell.isWeekend ? styles.weekend : '',
                      cell.isToday ? styles.today : '',
                      cell.isPast && !cell.isToday ? styles.cellPast : '',
                      hasReleases ? styles.cellClickable : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    role="gridcell"
                    aria-label={`${cell.dayNumber}${hasReleases ? `, ${cellReleases.length} divulgação${cellReleases.length > 1 ? 'ões' : ''}` : ''}`}
                    data-today={cell.isToday ? 'true' : undefined}
                    data-testid={`cal-cell-${cell.dateKey}`}
                    onClick={hasReleases ? () => openDetail(cell.date, cellReleases) : undefined}
                    onKeyDown={
                      hasReleases
                        ? (e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault()
                              openDetail(cell.date, cellReleases)
                            }
                          }
                        : undefined
                    }
                    tabIndex={hasReleases ? 0 : undefined}
                  >
                    <span
                      className={[
                        styles.dayNumber,
                        cell.isToday ? styles.todayNum : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {cell.dayNumber}
                    </span>
                    {cell.isToday && (
                      <span className={styles.todayKicker} aria-hidden="true">
                        {t('calendario.today.kicker')}
                      </span>
                    )}

                    <div className={styles.chips}>
                      {isCollapsed ? (
                        <>
                          {/* First chip only */}
                          <ReleaseChip
                            key={cellReleases[0]!.id}
                            release={cellReleases[0]!}
                            category={categoryByCode.get(cellReleases[0]!.series_code)}
                            todayKey={todayKey}
                          />
                          {/* Overflow button opens modal */}
                          <button
                            className={styles.overflowBtn}
                            onClick={(e) => {
                              e.stopPropagation()
                              openDetail(cell.date, cellReleases)
                            }}
                            title={`Ver todas as ${cellReleases.length} divulgações`}
                            aria-label={`+${overflowCount} divulgações a mais`}
                            data-testid="chip-overflow"
                            type="button"
                          >
                            +{overflowCount}
                          </button>
                        </>
                      ) : (
                        <>
                          {cellReleases.map((r) => (
                            <ReleaseChip
                              key={r.id}
                              release={r}
                              category={categoryByCode.get(r.series_code)}
                              todayKey={todayKey}
                            />
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Daily exclusion note */}
          <p className={styles.note} data-testid="daily-exclusion-note">
            {t('calendario.note.daily')}
          </p>
        </>
      )}

      {/* Daily + event series table — always rendered below calendar */}
      <DailyTable />
      </div>

      {/* Day-detail modal — portal, rendered outside scrollArea */}
      <DayDetailModal
        date={detailDate}
        releases={detailReleases}
        series={seriesData?.items ?? []}
        open={detailOpen}
        onClose={closeDetail}
      />
    </main>
  )
}
