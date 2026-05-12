# Phase 21 — Calendário Extensions

## Goals
Three interlocked features added to the Calendário page:

1. **DailyTable** — table below the calendar grid listing all series with
   `frequency in ('daily', 'event')`, with sortable columns and status dots.

2. **DayDetailModal** — portal modal opened when any calendar cell (with ≥1
   release) is clicked, showing all releases scheduled on that day.

3. **Cell chip collapse** — cells with > 3 releases show only the first chip
   plus a `+N` button that opens `DayDetailModal`; cells with ≤ 3 show all
   chips as before.

## File Ownership

### CREATE
- `frontend/src/components/DailyTable/index.tsx`
- `frontend/src/components/DailyTable/DailyTable.module.css`
- `frontend/src/components/DailyTable/DailyTable.test.tsx`
- `frontend/src/components/DayDetailModal/index.tsx`
- `frontend/src/components/DayDetailModal/DayDetailModal.module.css`
- `frontend/src/components/DayDetailModal/DayDetailModal.test.tsx`

### EDIT
- `frontend/src/pages/Calendario.tsx` — chip collapse rule, cell click handler,
  modal state, DailyTable + DayDetailModal mounts
- `frontend/src/pages/Calendario.module.css` — new tokens: `.cellClickable`,
  `.overflowBtn`, `.tableSection`
- `frontend/src/pages/Calendario.test.tsx` — new tests for collapse, modal
- `frontend/src/lib/formatPtBR.ts` — add `relativeTime(isoOrDate)` helper

### DO NOT TOUCH
- Backend, DB schema, other pages, other components.

## Key Decisions

### DailyTable
- Hooks: `useSeries()` → filter `frequency === 'daily' || frequency === 'event'`
- `useHealth()` for freshness per series
- No `useObservations` per row (avoids N+1 waterfall in table context); last
  value column shows `—` to keep the table lightweight.
- Click row → `AnalysisPanel` for that series code (same as DailyRow)
- Columns: Código · Fonte · Última coleta (datetime + relative) · Status dot
- Sort: Código (default asc) and Última coleta (desc/asc toggle)
- Freshness thresholds: fresh ≤24h (green), stale 24-72h (amber), failed >72h (red)

### DayDetailModal
- Props: `{ date: Date | null; releases: ReleaseRead[]; series: SeriesRead[]; open: boolean; onClose: () => void }`
- Portal to `document.body`
- Scrim: `rgba(11,23,48,0.45)` — matches AnalysisPanel
- Title: `"Divulgações em DD/MM/YYYY"`
- Rows: code + status badge (E/R) + category chip + fonte
- Esc + click-outside closes
- Animation: 160ms scrim fade + 220ms card `translateY(8px) scale(0.98)` → normal
- `prefers-reduced-motion`: no animation

### Cell Chip Collapse Rule
- `MAX_CHIPS` constant removed; new threshold `CHIP_THRESHOLD = 3`
- If `releases.length <= 3`: render all chips (unchanged)
- If `releases.length > 3`: render first chip only + `<button overflowBtn>+{N-1}</button>`
- All cells with ≥1 release are wrapped in a `<button>` or have `onClick` for
  the entire cell → opens DayDetailModal

### formatPtBR additions
- `relativeTime(date: Date | string): string` — "há 2h", "há 3min", "há 5d"

## Test Strategy
- DailyTable: renders rows, status dots correct, sort toggles, empty state
- DayDetailModal: renders releases for date, closes on Esc/scrim, empty state
- Calendario: ≤3 releases → all chips, >3 → 1 chip + overflow button,
  click cell opens modal, existing 25 tests unchanged

## Constraints
- Vanilla CSS modules only
- Design tokens only (no raw hex except where existing DailyRow.module.css used)
- pt-BR text throughout
- No new npm dependencies
- Touch targets ≥ 44px on cells and table rows
- `prefers-reduced-motion` respected in all animations
