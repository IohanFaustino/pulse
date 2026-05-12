/**
 * pt-BR locale formatters using the Intl API.
 *
 * All formatters use 'pt-BR' locale to match the app's language convention.
 * No external date libraries — pure Intl.
 */

// ── Number formatters ─────────────────────────────────────────────────────────

const numberFmt = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const numberCompactFmt = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
})

const percentFmt = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const currencyFmt = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

// ── Date formatters ───────────────────────────────────────────────────────────

const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const dateLongFmt = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const dateShortFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
})

const dateMonthYearFmt = new Intl.DateTimeFormat('pt-BR', {
  month: 'long',
  year: 'numeric',
})

const datetimeFmt = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const dayOfWeekFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
const dayNumberFmt = new Intl.DateTimeFormat('pt-BR', { day: 'numeric' })

// ── Exports ───────────────────────────────────────────────────────────────────

/** Format a number with 2 decimal places in pt-BR. */
export function formatNumber(value: number): string {
  return numberFmt.format(value)
}

/** Format a number in compact notation (1,2 mi, 3,4 bi). */
export function formatCompact(value: number): string {
  return numberCompactFmt.format(value)
}

/** Format a ratio (0–1) as a percentage with 2 decimal places. */
export function formatPercent(value: number): string {
  return percentFmt.format(value)
}

/** Format a number as BRL currency. */
export function formatCurrency(value: number): string {
  return currencyFmt.format(value)
}

/**
 * Format a delta value with explicit sign prefix and 2 decimal places.
 * e.g. +1,23  or  -0,45
 */
export function formatDelta(value: number): string {
  const formatted = numberFmt.format(Math.abs(value))
  return value >= 0 ? `+${formatted}` : `-${formatted}`
}

/**
 * Parse an ISO-8601 date string and return a Date object.
 * Handles both "YYYY-MM-DD" and full ISO datetime strings.
 */
function parseDate(iso: string): Date {
  // "YYYY-MM-DD" — parse as local midnight to avoid UTC shift on date-only strings
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [year, month, day] = iso.split('-').map(Number)
    return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)
  }
  return new Date(iso)
}

/** Format an ISO date string as DD/MM/YYYY. */
export function formatDate(iso: string): string {
  return dateFmt.format(parseDate(iso))
}

/** Format an ISO date string as "12 de janeiro de 2026". */
export function formatDateLong(iso: string): string {
  return dateLongFmt.format(parseDate(iso))
}

/** Format an ISO date string as "12 jan". */
export function formatDateShort(iso: string): string {
  return dateShortFmt.format(parseDate(iso))
}

/** Format an ISO date string as "janeiro de 2026". */
export function formatMonthYear(iso: string): string {
  return dateMonthYearFmt.format(parseDate(iso))
}

/** Format an ISO datetime string as DD/MM/YYYY HH:MM. */
export function formatDatetime(iso: string): string {
  return datetimeFmt.format(new Date(iso))
}

/** Format a Date's weekday as abbreviated pt-BR (e.g. "seg", "ter"). */
export function formatWeekday(date: Date): string {
  return dayOfWeekFmt.format(date)
}

/** Format a Date's day number. */
export function formatDayNumber(date: Date): string {
  return dayNumberFmt.format(date)
}

/**
 * Return a greeting based on the current hour.
 *
 * @param lang - 'pt' (default) or 'en'. Passing a lang value avoids coupling
 *               this pure formatter to the i18n store directly.
 */
export function greeting(lang: 'pt' | 'en' = 'pt'): string {
  const hour = new Date().getHours()
  if (lang === 'en') {
    if (hour < 12) return 'Good morning.'
    if (hour < 18) return 'Good afternoon.'
    return 'Good evening.'
  }
  if (hour < 12) return 'Bom dia.'
  if (hour < 18) return 'Boa tarde.'
  return 'Boa noite.'
}

/**
 * Split a unit string into (core, qualifier).
 *   "R$ mi (preços 1995)" → ["R$ mi", "preços 1995"]
 *   "índice"              → ["índice", null]
 */
export function splitUnit(unit?: string): [string, string | null] {
  if (!unit) return ['', null]
  const m = unit.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (m) return [m[1].trim(), m[2].trim()]
  return [unit.trim(), null]
}

/**
 * Map a frequency label (pt-BR or EN) to a single-letter pill code.
 *   monthly / mensal      → M
 *   quarterly / trimestral → Q
 *   daily / diária        → D
 *   annual / anual        → A
 *   event / evento        → E
 */
export function frequencyPill(freq?: string): string {
  if (!freq) return ''
  const f = freq.toLowerCase()
  if (f.startsWith('d')) return 'D'
  if (f.startsWith('m')) return 'M'
  if (f.startsWith('q') || f.startsWith('t')) return 'Q'
  if (f.startsWith('a')) return 'A'
  if (f.startsWith('e')) return 'E'
  return f.charAt(0).toUpperCase()
}

/**
 * Relative date for daily series, absolute for everything else.
 *   today      → "hoje"
 *   yesterday  → "ontem"
 *   < 7 days   → "há N dias"
 *   else       → DD/MM/YYYY
 */
export function relativeDate(iso: string, freq?: string): string {
  if (!freq || !freq.toLowerCase().startsWith('d')) {
    return formatDate(iso)
  }
  const d = parseDate(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(d)
  target.setHours(0, 0, 0, 0)
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000)
  if (diffDays === 0) return 'hoje'
  if (diffDays === 1) return 'ontem'
  if (diffDays > 1 && diffDays < 7) return `há ${diffDays} dias`
  return formatDate(iso)
}

/**
 * Format today's date as a long string in pt-BR.
 * e.g. "domingo, 11 de maio de 2026"
 */
export function formatToday(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
}

/**
 * Return a human-readable relative time string in pt-BR.
 * e.g. "há 2h", "há 30min", "há 5d", "nunca"
 *
 * Accepts an ISO string or a Date object.
 */
export function relativeTime(dateOrIso: Date | string | null | undefined): string {
  if (!dateOrIso) return 'nunca'
  const date = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso
  if (isNaN(date.getTime())) return 'nunca'
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 0) return 'agora'
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'agora mesmo'
  if (diffMin < 60) return `há ${diffMin}min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `há ${diffH}h`
  const diffD = Math.floor(diffH / 24)
  return `há ${diffD}d`
}
