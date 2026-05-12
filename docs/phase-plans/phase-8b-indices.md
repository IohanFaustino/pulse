# Phase 8b: Índices Page

**Agent:** react-specialist  **Wave:** W4b  **Skills:** react-expert, typescript-pro, frontend-design

---

## Files owned

### Create (new files)
| Path | Purpose |
|---|---|
| `frontend/src/pages/Indices.tsx` | REPLACE — full Índices catalog implementation |
| `frontend/src/pages/Indices.module.css` | CSS Modules styles for Índices page |
| `frontend/src/pages/Indices.test.tsx` | Vitest + RTL test suite for Índices page |

### DO NOT touch
- `frontend/src/pages/Painel.tsx`
- `frontend/src/pages/Calendario.tsx`
- `frontend/src/pages/Metadados.tsx`
- `frontend/src/App.tsx`
- `frontend/src/components/**`
- `frontend/src/hooks/**`
- `frontend/src/lib/**`
- `frontend/src/api/schema.ts`

---

## Interfaces

### Consumed (from W4a shared components)
| Interface | Source |
|---|---|
| `Card` (default export) | `@/components/Card` — renders one catalog entry with star pin |
| `CategoryToggle` + `CategoryOption` | `@/components/CategoryToggle` — tab bar with Todos + category chips |
| `EmptyState` (default export) | `@/components/EmptyState` — "all pinned" and search-no-result states |
| `LoadingSkeleton.Grid` | `@/components/LoadingSkeleton` — card grid skeleton while loading |
| `useSeries` + `SeriesRead` | `@/hooks/useSeries` — GET /series full list |
| `useUserPrefs` + `UserPrefsRead` | `@/hooks/useUserPrefs` — GET /user_prefs for pinned set |
| `usePin` | `@/hooks/useUserPrefs` — PATCH /user_prefs add_pins mutation |
| `useObservations` | `@/hooks/useObservations` — GET /series/{code}/observations per card |
| `computeDelta` | `@/lib/deltaSemantics` — delta value + direction |

### Produced (for documentation / downstream)
| Interface | Consumer |
|---|---|
| `Indices` (default export, React component) | `App.tsx` — already wired at `/indices` route |

---

## Behavior specification

### Data pipeline
1. `useSeries()` → full list of 25 series (SeriesRead[])
2. `useUserPrefs()` → pinned set (`data.pins[].series_code`)
3. Filter: `unpinned = allSeries.filter(s => !pinnedCodes.has(s.code))`
4. Apply search: case-insensitive substring match on `code` OR `name`
5. Apply category: if activeCategory !== 'Todos', filter by `series.category`
6. Each visible card lazily fetches `useObservations({ code, limit: 24 })` for sparkline

### Pin flow (FR-4.1, AC-2)
- Star click → `usePin().pin(code)` → optimistic cache update via onSuccess in hook
- After mutation settles, `useSeries` + `useUserPrefs` caches are stale → React Query refetches
- Pinned series disappear from catalog automatically

### Navigation (out-of-scope stub)
- Card body click → `navigate('/metadados?code=' + code)` using `useNavigate()`

### Empty states
- Loading: `<LoadingSkeleton.Grid count={8} />`
- All pinned (unpinned.length === 0 AND search is empty): EmptyState "all pinned" variant
- Search returns no results (filtered.length === 0 AND search non-empty): EmptyState "no results" variant

---

## Test strategy

| Test | Assertion | Maps to spec |
|---|---|---|
| Greeting renders | `data-testid="indices-greeting"` is in DOM | doc §4.1 |
| Search input visible | `role="searchbox"` present | doc §4.2 |
| Search filters by code (case-insensitive) | type "ipca" → only IPCA card visible | doc §4.2 |
| Search filters by name | type "inflação" substring → matching cards only | doc §4.2 |
| Category tab filters | select "Juros" → only Juros cards visible | doc §4.3 |
| Pinned series absent | mock prefs with IPCA pinned → IPCA card not rendered | FR-4.1 |
| Empty state when all pinned | all codes in pins → EmptyState rendered | doc §4.5 |
| Star click calls pin mutation | userEvent.click star → mutate called with code | FR-4.1, AC-2 |
| Card sparkline rendered | observations mock → sparkline in DOM | doc §4.4 |
| Delta rendered per card | observations mock with 2+ points → DeltaBadge in DOM | doc §4.4 |
| Search no-results empty state | search gibberish → empty state (no results variant) | doc §4.5 |

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| `useObservations` per-card = N parallel requests | Enabled only when card is visible; acceptable for catalog < 25 items |
| `noUncheckedIndexedAccess` — `obs.items.at(-1)` can be undefined | Guard with nullish coalescing |
| CSS Modules class mangling in tests | Use `data-testid` + aria selectors exclusively |
| Query cache stale after pin | `usePin` hook's `onSuccess` already updates `user_prefs` cache; `useSeries` staleTime=60s is acceptable (pin makes card disappear via local filter on prefs data) |
| `CategoryOption` type mismatch | Import `CategoryOption` from `@/components/CategoryToggle` and use it for `activeCategory` state |

---

## Acceptance criteria mapped

| Criterion | Test |
|---|---|
| AC-2: IPCA disappears from catalog after pin | `pinned-series-absent` test |
| FR-4.1: star click → add_pins mutation | `star-click-calls-pin-mutation` test |
| doc §4.5: all-pinned empty state | `empty-state-when-all-pinned` test |
| doc §4.2: real-time search filter | `search-filters-by-code`, `search-filters-by-name` tests |

---

## Background services needed

| Service | Expected state |
|---|---|
| None required for unit tests | Tests use RTL + mocked hooks |
