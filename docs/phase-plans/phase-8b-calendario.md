# Phase 8b: Calendário Page — Full Month Grid

**Agent:** react-specialist  **Wave:** W4b  **Skills:** react-expert, typescript-pro, frontend-design

---

## Files owned

### Create
| Path | Purpose |
|---|---|
| `frontend/src/pages/Calendario.tsx` | REPLACE stub — full month-grid implementation |
| `frontend/src/pages/Calendario.module.css` | Page styles (tokens only, no raw hex) |
| `frontend/src/pages/Calendario.test.tsx` | Vitest + RTL tests |

### DO NOT TOUCH
- `frontend/src/pages/Painel.tsx`
- `frontend/src/pages/Indices.tsx`
- `frontend/src/pages/Metadados.tsx`
- `frontend/src/components/**`
- `frontend/src/hooks/**`
- `frontend/src/lib/**`
- `frontend/src/App.tsx`
- `frontend/src/api/schema.ts`
- Backend files

---

## Interfaces consumed

| Interface | Source | Usage |
|---|---|---|
| `useReleases(params)` | `hooks/useReleases.ts` | Fetch `GET /releases?month=YYYY-MM&category=` |
| `ReleaseRead` type | `hooks/useReleases.ts` | Shape of each calendar event |
| `CategoryToggle` | `components/CategoryToggle` | Category filter chips |
| `CategoryOption`, `CATEGORIES` | `components/CategoryToggle` | Typed category list |
| `LoadingSkeleton` | `components/LoadingSkeleton` | Calendar skeleton while loading |
| `EmptyState` | `components/EmptyState` | No-releases-found empty state |
| `greeting`, `formatMonthYear` | `lib/formatPtBR.ts` | pt-BR formatting |
| `categoryColor` | `lib/categoryColor.ts` | Chip code text colour by category |
| Design tokens | `styles/tokens.css` | All colours, spacing, motion |

Note: FR-6.7 (exclude daily series) is enforced server-side by the API
(`GET /releases` omits daily-frequency series). The frontend does NOT need
to call `useSeries()` for frequency checks — the API contract guarantees
daily series are absent from the response.

---

## Local state

```ts
const [currentMonth, setCurrentMonth] = useState<Date>(() => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1)
})
const [activeCategory, setActiveCategory] = useState<CategoryOption>('Todos')
```

---

## Grid computation

```
yyyyMM(currentMonth) → "YYYY-MM" for API call
firstDayOfMonth       → new Date(year, month, 1)
startPad              → firstDayOfMonth.getDay() (0=Sun, 6=Sat)
daysInMonth           → new Date(year, month+1, 0).getDate()
totalCells            → Math.ceil((startPad + daysInMonth) / 7) * 7
cells[]               → null (pad) | Date
```

Releases are keyed by ISO date string (YYYY-MM-DD) into a `Map<string, ReleaseRead[]>`.

Each cell with releases shows up to 6 chips; if more → `+N overflow`.

---

## Chip classification

```
scheduled_for < today  → status "realized" / class .chipR (red --down)
scheduled_for >= today → status "expected" / class .chipE (green --up)
```

API already sets `status` field; we also classify by date for visual certainty.

---

## E/R counters

Derived from `releases.items` after fetch — count each status value:
- `eCount` = items where status === 'expected'
- `rCount` = items where status === 'realized'

---

## Acceptance criteria mapped (from spec)

| Criterion | Implementation |
|---|---|
| FR-6.1 — 7-col grid, max 6 chips + +N | `cells` array, 7-col CSS grid, chip slice logic |
| FR-6.2 — R chips red | `.chipR` class → `color: var(--down)` |
| FR-6.3 — E chips green | `.chipE` class → `color: var(--up)` |
| FR-6.4 / AC-5 — nav updates month + counters | `handlePrev`, `handleNext`, counter derived from query data |
| FR-6.5 — today navy border + sky number | `.today` modifier on cell, `.todayNum` on date span |
| FR-6.7 — daily excluded | API excludes daily; FE relies on API contract |

---

## Test strategy

| Test | Description |
|---|---|
| renders 7-column grid | Count `[data-testid="cal-col-header"]` === 7 |
| prev/next nav updates month label | Click nav, assert month heading changes |
| "Hoje" returns to current month | Navigate away then click Hoje |
| E counter increments for future events | Mock future release → eCount badge |
| R counter increments for past events | Mock past release → rCount badge |
| Today cell gets `.today` class | Find today's cell, assert data-today attr |
| Weekend cells get `.weekend` modifier | Check Sunday/Saturday cells |
| +N overflow when >6 chips | Mock 8 releases on one day, assert "+2" shown |
| Empty state shown when no releases | Mock empty items array |
| Loading skeleton shown while fetching | Query in loading state |
| Category prop passed to hook | activeCategory state change fires new query |

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| `scheduled_for` is a date string, not Date | Parse with local midnight (`new Date(y, m-1, d)`) to avoid UTC shift |
| `noUncheckedIndexedAccess` — `items[0]` can be undefined | All array accesses guarded with optional chaining |
| CSS Modules class names mangled in tests | Use `data-testid` and `data-*` attrs as selectors |
| ReleaseRead has no `category` field | Must cross-reference series list OR accept that chip colours require a category lookup |

Note on category colour: `ReleaseRead` does not include `category`. The
chip will display the series code in the category colour. Since we cannot
do a per-release lookup without an additional series endpoint call,
the page will call `useSeries()` once (no filter) to build a
`Map<code, category>` lookup for colouring chips. This is a single
cached query (staleTime=60s) per TanStack Query.

---

## Background services needed

| Service | Expected state |
|---|---|
| `api-web-1` | Running (port 5174→5173) |
| `api-api-1` | Running + healthy (for proxy) |
