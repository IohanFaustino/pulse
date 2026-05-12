# Phase 8b: Metadados Page (Dossier two-column)

**Agent:** react-specialist  **Wave:** W4b  **Skills:** react-expert, typescript-pro, frontend-design

---

## Files owned

### Create (new files)

| Path | Purpose |
|---|---|
| `frontend/src/pages/Metadados.module.css` | Two-column layout + dossier styles |
| `frontend/src/pages/Metadados.test.tsx` | Full test suite (8 test cases) |

### Edit (existing files)

| Path | Change |
|---|---|
| `frontend/src/pages/Metadados.tsx` | Replace stub — full implementation |

### DO NOT touch

- `frontend/src/App.tsx` — routing already wired
- `frontend/src/components/**` — shared components from W4a
- `frontend/src/hooks/**` — data hooks from W4a
- `frontend/src/lib/**` — lib utilities from W4a
- `frontend/src/api/schema.ts` — generated; do not edit
- Any backend file

---

## Interfaces

### Consumed (from W4a)

| Interface | Source file | Used for |
|---|---|---|
| `useSeries()` | `hooks/useSeries.ts` | Left list — all series |
| `useSeriesOne(code)` | `hooks/useSeriesOne.ts` | Dossier metadata |
| `useObservations({ code, limit })` | `hooks/useObservations.ts` | Hero value + sparkline |
| `Sparkline` | `components/Sparkline/index.tsx` | Snapshot sparkline |
| `LoadingSkeleton.*` | `components/LoadingSkeleton/index.tsx` | Loading states |
| `EmptyState` | `components/EmptyState/index.tsx` | No selection / no results |
| `categoryColor`, `categoryBgColor` | `lib/categoryColor.ts` | Category chip colour |
| `formatDate`, `formatNumber`, `greeting` | `lib/formatPtBR.ts` | Locale formatting |
| `SeriesRead` | `hooks/useSeries.ts` (re-export from schema) | Type annotation |
| `ObservationRead` | `hooks/useObservations.ts` (re-export) | Latest value extraction |

### Consumed from react-router-dom

- `useSearchParams` — read/write `?code=X` deep-link param

### Produced (for downstream phases)

- `/metadados?code=X` deep-link — navigable URL from other pages

---

## Layout architecture

```
<page-metadados>
  ├── Greeting + toolbar row (search input + category chips)
  └── two-col-layout
      ├── left-panel (sticky, scrollable independently)
      │   └── filtered series list items (code + category chip)
      └── right-panel (dossier)
          ├── [empty state when no code selected]
          └── [dossier when code selected]
              ├── header: code (large navy serif) + name + category chip
              ├── editorial description (from metadata.description or static map)
              ├── field-grid: Fonte · Frequência · Unidade · Primeira obs ·
              │              Última divulgação · Próxima divulgação (navy) ·
              │              Calendário · Metodologia · Site oficial
              └── snapshot: hero value (navy) + sparkline (24 obs)
```

---

## State management

```typescript
// From URL:
const [searchParams, setSearchParams] = useSearchParams()
const selectedCode = searchParams.get('code') ?? ''

// Local state:
const [searchQuery, setSearchQuery] = useState('')
const [activeCategory, setActiveCategory] = useState<string>('Todos')

// Derived: filtered list from useSeries() data
// On item click: setSearchParams({ code: item.code })
// On first load with no ?code: auto-select first item in filtered list
```

---

## Data sources for dossier fields

| Field | Source |
|---|---|
| Fonte | `series.source` |
| Frequência | `series.frequency` |
| Unidade | `series.unit` |
| Primeira observação | `series.first_observation` → `formatDate()` |
| Última divulgação | `series.last_success_at` → `formatDate()` |
| Próxima divulgação | static map by code (from `data/calendar.json` patterns); fallback "—" |
| Calendário | link text → "Ver Calendário" (navigate to /calendario?code=X) |
| Metodologia | static map per source (`BCB SGS → "bcb.gov.br/metodologia"`) |
| Site oficial | static map per source |
| Editorial description | `series.metadata?.description` cast from `Record<string,never>` → `unknown` → fallback to static description map |
| Hero value | `observations.items[last].value` |
| Sparkline | last 24 from `useObservations({ code, limit: 60 })` → slice last 24 |

Static maps are typed `Record<string, string>` and keyed on `series.code` or `series.source`.

---

## Test strategy

| # | Test | Assertion |
|---|---|---|
| 1 | Left list renders all series | All codes from mock data appear in DOM |
| 2 | Search query filters left list | Typing "IPCA" shows only matching items |
| 3 | Category chip filters left list | Selecting "Juros" hides non-Juros items |
| 4 | Click left item → right pane updates | Click SELIC → dossier header shows "SELIC" |
| 5 | URL param `?code=IPCA` pre-selects | Render with `?code=IPCA` → IPCA dossier shown without clicking |
| 6 | Dossier shows key fields | code, name, fonte, frequência, unidade, primeira obs (FR-7.2) |
| 7 | Hero value renders from observations | Hero shows formatted observation value |
| 8 | Empty selection shows prompt | No `?code` param + empty list → EmptyState rendered |

---

## Acceptance criteria mapped

| FR | Test |
|---|---|
| FR-7.1 — two-column sticky list + dossier | Layout renders with `data-testid="meta-list"` + `"meta-dossier"` |
| FR-7.2 — dossier fields | Test #6: all required fields present |
| NFR-5 — pt-BR | All UI text in pt-BR; Intl formatters used for dates/numbers |

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| `noUncheckedIndexedAccess` — `items[last]` may be undefined | `items.at(-1)` + optional chaining throughout |
| `series.metadata` typed as `Record<string,never>` | Cast via `as unknown as Record<string, unknown>` only at access site |
| No next-release endpoint in API | Static map with sensible fallback "—"; documented as limitation |
| URL param on first load — no code | Auto-select first item after list loads; guard against empty list |
| Search params update triggers navigation | Use `replace: true` in `setSearchParams` to avoid browser history bloat |

---

## Background services needed

| Service | Expected state |
|---|---|
| `api-web-1` | Running (Vite dev, port 5173) |
| `api-api-1` | Running (FastAPI, port 8000) — optional; mocked in tests |
