# Phase 16 — Metadados Page Improvements

## Scope

Apply improvements.md to the Metadados page (http://localhost:5174/metadados).

## File Ownership

| File | Action | Change summary |
|---|---|---|
| `frontend/src/pages/Metadados.tsx` | EDIT | Remove auto-select useEffect; fix selectedCode null handling; add grouped-by-source rendering |
| `frontend/src/pages/Metadados.module.css` | EDIT | Fix active item shadow; 8px scrollbar; top-align layout; source group heading styles |
| `frontend/src/pages/Metadados.test.tsx` | EDIT | Add no-auto-select test; grouped-by-source test; confirm empty state test |

## Do NOT touch

- `frontend/src/hooks/*.ts`
- `frontend/src/components/*.tsx`
- `frontend/src/api/schema.ts`
- `frontend/src/styles/tokens.css`
- Backend files

## Change Details

### 1. Remove auto-select (Req 1)

- Remove `useEffect` at lines 351-359 that calls `setSearchParams({code: first.code})` on mount
- Change `selectedCode` derivation from `searchParams.get('code') ?? ''` to `searchParams.get('code') ?? undefined`
- Right pane already has empty state branch when `!selectedCode` — this will now correctly trigger on default route

### 2. Scrollbar in left list (Req 2)

- `.leftPanel` already has `overflow-y: auto` and the `.body` grid has `overflow: hidden` + `min-height: 0`
- Update scrollbar width from 4px to 8px
- Add `scrollbar-width: thin` and explicit `scrollbar-color` for Firefox
- Ensure `.body` has `align-items: start` so left panel doesn't stretch to full column height unnecessarily

### 3. Active item shadow fix (Req 3)

`.listItemActive`:
- `background: var(--surface)` (white, clean lift)
- `border-left: 2px solid var(--accent-3)` (sky blue, 2px not 3px border)
- `box-shadow: 0 1px 3px rgba(11, 47, 102, 0.08)` = `var(--shadow-sm)` (subtle, contained)
- Remove any transform/translate that could cause overflow

`.listItemActive:hover`:
- `background: var(--bg-deep)` (no shadow on hover)
- `box-shadow: none`

Note: `.listItem` base has `border-left: 3px solid transparent` — change to `2px` to match active state width.

### 4. Cluster by source when filter != Todos (Req 4)

Add `grouped` memo in page component:
```ts
const SOURCE_ORDER = ['BCB SGS', 'IBGE SIDRA', 'Yahoo Finance']

const grouped = useMemo(() => {
  if (activeCategory === 'Todos') return null
  const map = new Map<string, SeriesRead[]>()
  for (const s of filtered) {
    if (!map.has(s.source)) map.set(s.source, [])
    map.get(s.source)!.push(s)
  }
  return SOURCE_ORDER
    .filter(src => map.has(src))
    .map(src => ({ source: src, items: map.get(src)! }))
}, [filtered, activeCategory])
```

Render in left panel: when `grouped` is non-null, iterate groups with `<p className={styles.sourceHeading}>` header. When null → flat list as today.

### 5. Top-aligned layout (Req 5)

- `.body` grid: add `align-items: start`
- Both columns get same padding-top via their own padding declarations

### CSS additions

`.sourceHeading`:
- `font-family: var(--font-mono)`
- `font-size: 0.6875rem`
- `text-transform: uppercase`
- `letter-spacing: 0.06em`
- `color: var(--ink); opacity: 0.45`
- `padding: var(--space-3) var(--space-4) var(--space-1)`
- `margin: 0`

## Test Plan

1. **No auto-select**: render without `?code` param → right pane shows empty state text, NOT dossier
2. **Deep-link preserved**: render with `?code=IPCA` → dossier shows IPCA (existing test 5)
3. **Source group headings**: when category filter 'Atividade' active, source heading 'IBGE SIDRA' appears (PIB is IBGE, IBC-Br would be BCB SGS)
4. **Existing tests**: all existing assertions preserved

## Deviations from Instructions

- `selectedCode` type: using `string | null` (from `searchParams.get()`) rather than `?? undefined` to avoid TypeScript widening; will check with `if (!selectedCode)` which covers both null and empty string
- Border stays `border-left` on `.listItem` base at 2px (down from 3px) to match the active 2px accent border without layout shift
