# Phase 8b: Painel Page

**Agent:** react-specialist  **Wave:** W4b  **Skills:** react-expert, typescript-pro, frontend-design

---

## Files owned

| Action | Path |
|---|---|
| replace | `frontend/src/pages/Painel.tsx` |
| create  | `frontend/src/pages/Painel.module.css` |
| create  | `frontend/src/pages/Painel.test.tsx` |

**DO NOT TOUCH:** any other page, components/, hooks/, lib/, stores/, App.tsx, schema.ts, backend.

---

## Architecture decisions

### Data flow

```
useUserPrefs()           → pinned_series[], card_transforms{}
useSeries()              → SeriesRead[] (all 25, for metadata lookup by code)
useObservations(code,24) → per-pinned-card, N parallel queries
useReleases({month})     → ReleaseRead[] for CalendarStrip + status counters
```

### Pinned card data assembly (per code)

```
seriesMap[code]          → { name, category, source, unit, … }
observations.items[-1]   → current value
observations.items[-2]   → previous value
computeDelta(curr, prev, category) → { delta, direction }
card_transforms[code]    → TransformSpec | null (active transform)
```

### Status counters

- "N índices com divulgação hoje" — releases with `scheduled_for === today ISO`
- "X esta semana" — releases with scheduled_for in [today, today+6] ISO range
- "K índices fixados" — `pinned_series.length`

All computed from `releases.items` (current month) client-side.

### Category grouping (Todos mode)

```
Group by: seriesMap[code].category
Order:    Inflação → Atividade → Trabalho → Juros → Câmbio → Mercado → Fiscal → Externo
Each group: <h2 className={styles.categoryTitle}> + flex-wrap grid
```

### TransformModal control

Local state: `modalCode: string | null`  
Open: set `modalCode = code`  
Close: set `modalCode = null`  
Apply: `setTransform(code, spec)` → optimistic update via TanStack → invalidate `['transform', code]` keys

### CalendarStrip scope

- `pinnedCodes.length > 0` → filter `releases.items` to only pinned codes
- `pinnedCodes.length === 0` → pass all releases (fallback per doc §3 + AC-7)

---

## Component layout (Painel.tsx)

```
<main data-testid="page-painel">
  <header>
    <div.greetingRow>
      <h1.greeting>  {greeting()}
      <time.date>    {formatToday()}
    <p.statusLine>   N com divulgação hoje · X esta semana · K fixados
  <div.controls>
    <CategoryToggle selected onSelect />
  {pinnedCodes.length === 0
    ? <EmptyState icon="○" title="Nenhum índice fixado" subtitle="…" ctaLabel="Ir para Índices" onAction={navigate('/indices')} />
    : <>
        {category === 'Todos'
          ? CATEGORY_ORDER.filter(cat has pins).map(cat =>
              <section key={cat}>
                <h2.categoryTitle style={{ color: categoryColor(cat) }}>{cat}
                <div.grid>
                  {pinnedInCat.map(code => <PinnedCard />)}
            )
          : <div.grid>
              {filteredPins.map(code => <PinnedCard />)}
        }
        <section.calendarSection aria-label="Próximas divulgações">
          <h2.sectionTitle>Agenda — próximos 14 dias
          <CalendarStrip releases={scopedReleases} />
      </>
  }
  {modalCode && (
    <TransformModal
      code={modalCode}
      name={seriesMap[modalCode].name}
      currentSpec={card_transforms[modalCode] ?? null}
      onApply={handleApply}
      onCancel={() => setModalCode(null)}
    />
  )}
</main>
```

### PinnedCard (inline render function, not a separate file)

Takes: `code`, `seriesMap`, `observations`, `card_transforms`, `onUnpin`, `onModify`  
Returns: `<SkeletonCard />` while loading, error chip if error, `<SmallMultiple />` when ready.

---

## Interfaces consumed

| Source | Shape used |
|---|---|
| `useUserPrefs()` | `.data.pinned_series`, `.data.card_transforms` |
| `useUnpin()` | `.unpin(code)` |
| `useSetTransform()` | `.setTransform(code, spec \| null)` |
| `useSeries()` | `.data.items[]` → `Map<code, SeriesRead>` |
| `useObservations({code, limit:24})` | `.data.items[]` sorted by observed_at |
| `useReleases({month: YYYY-MM})` | `.data.items[]` for strip + counters |
| `computeDelta` from `@/lib/deltaSemantics` | per-card delta + direction |
| `greeting`, `formatToday` from `@/lib/formatPtBR` | greeting line |
| `categoryColor` from `@/lib/categoryColor` | category title colour |
| `SmallMultiple`, `EmptyState`, `CalendarStrip`, `CategoryToggle` | components |
| `SkeletonCard` from `LoadingSkeleton` | per-card loading state |
| `TransformModal` | transform apply/cancel |
| `useUiStore` | `setLastVisitedPage('/painel')` in useEffect |
| `useQueryClient` | invalidate `['transform', code]` after setTransform |

---

## Test strategy (Painel.test.tsx)

| Test | AC / FR |
|---|---|
| Renders greeting using formatPtBR.greeting() | FR-5 |
| Renders pt-BR date string | FR-5, NFR-5 |
| Empty state renders when pinned_series=[] | FR-4.4, AC-7 |
| Empty state CTA navigates to /indices | AC-7 |
| With 2 pinned series: renders 2 SmallMultiple cards | FR-5.1 |
| Unpin click calls useUnpin.unpin(code) | FR-4.2, AC-2 |
| Modify click opens TransformModal for that code | FR-5.4, AC-3 |
| TransformModal apply → useSetTransform.setTransform called | FR-8.2, AC-3 |
| Category filter 'Juros' shows only Juros cards (flat grid) | FR-5.3 |
| Category 'Todos' shows category group title headers | FR-5.2 |
| Transform badge visible when card_transforms[code] is set | FR-5.5, AC-3 |
| CalendarStrip receives filtered releases (pinned scope) | doc §3 |
| CalendarStrip falls back to all releases when no pins | AC-7 |

All tests use hand mocks (no MSW; not installed). TanStack Query wrapped in `createWrapper()` helper that creates a fresh `QueryClient` per test with `defaultOptions.queries.retry=false`.

---

## Acceptance criteria mapped

| Criterion | Spec reference | Test |
|---|---|---|
| Empty Painel shows CTA → Índices | AC-7 | empty state CTA test |
| Pin shows on Painel within 200ms | AC-2 | not performance-tested; mutation optimistic |
| Transform badge appears | AC-3, FR-5.5 | transform badge test |
| Category grouped when Todos | FR-5.2 | category title test |
| Flat grid when filter active | FR-5.3 | category filter test |
| Unpin removes from grid | FR-4.2 | unpin callback test |

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| `noUncheckedIndexedAccess` — obs[-1] may be undefined | Use `.at(-1)` with nullish check |
| `card_transforms[code]` schema typed as `Record<string, never>` | Cast to `TransformSpec \| null` on read |
| N parallel observation queries (N=K pinned) during testing | Mock `useObservations` directly via vi.mock |
| `useNavigate` requires Router context in tests | Wrap renders in `<MemoryRouter>` |
| TransformModal portal targets `document.body` in jsdom | Works out-of-box in jsdom; no special handling |

---

## Background services needed

| Service | Expected state |
|---|---|
| `api-web-1` (Vite port 5173) | Running for manual smoke |
| `api-api-1` (FastAPI port 8000) | Running for real data (optional for tests) |
