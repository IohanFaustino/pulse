# Phase 14 — Indices Page Improvements

## Scope

Apply improvements.md to the Indices page (http://localhost:5174/indices).

## File Ownership

| File | Action | Change summary |
|---|---|---|
| `frontend/src/pages/Indices.tsx` | EDIT | Fixed scroll container; group cards by source when filter != "Todos" |
| `frontend/src/pages/Indices.module.css` | EDIT | `.page` fixed height + overflow, `.scrollArea`, source group heading styles, title sizing |
| `frontend/src/components/Card/index.tsx` | EDIT | Remove visible `.name` paragraph; add info icon button + popover with name/source/freq/date |
| `frontend/src/components/Card/Card.module.css` | EDIT | Popover styles, info button styles, hide `.name` |
| `frontend/src/components/Card/Card.test.tsx` | EDIT | Remove name-in-body assertions; add info icon open/close/dismiss tests |
| `frontend/src/pages/Indices.test.tsx` | EDIT | Add group-by-source tests; remove any name-text-in-card-body assertions |

## Do NOT touch

- `frontend/src/hooks/*.ts`
- `frontend/src/api/schema.ts`
- `frontend/src/styles/tokens.css`
- Backend files

## Change Details

### 1. Structural — Fixed page + scrollbar

- `.page` becomes a flex column of fixed height: `height: 100dvh` (it fills `.main` which already has `overflow: hidden`)
- `.header` + `.toolbar` stay at top (no position: sticky needed — they're flex items before the scroll area)
- New `.scrollArea` div wraps the grid (and empty states): `flex: 1; overflow-y: auto; min-height: 0`
- Custom scrollbar: `8px` width, `var(--bg-deep)` thumb, `var(--bg)` track

### 2. Filters — cluster by source when filter active

- In Indices.tsx, derive `grouped` memo:
  ```ts
  const grouped = useMemo(() => {
    if (activeCategory === 'Todos') return null
    const map = new Map<string, SeriesRead[]>()
    const order = ['BCB SGS', 'IBGE SIDRA', 'Yahoo Finance']
    for (const s of filtered) {
      if (!map.has(s.source)) map.set(s.source, [])
      map.get(s.source)!.push(s)
    }
    return order.filter(src => map.has(src)).map(src => ({ source: src, items: map.get(src)! }))
  }, [filtered, activeCategory])
  ```
- Render: if `grouped` → iterate groups, each with `<h3 className={styles.sourceHeading}>` + `.grid`
- If `grouped === null` → current flat `.grid`

### 3. Title sizing

- `.greeting` font-size: `clamp(0.875rem, 0.5vw + 0.8rem, 1rem)` (currently 1.125rem)
- Keep `font-style: italic` and `font-family: var(--font-serif)`
- `.greetingSub` font-size: `0.8125rem` (already 0.8125rem — verify, keep as-is or set explicitly to 0.8125rem)

### 4. Card — remove name, add info popover

**Card component changes:**
- Remove `<p className={styles.name}>{name}</p>` from JSX
- Add info button next to code in header:
  ```tsx
  <button
    className={styles.infoBtn}
    onClick={handleInfoClick}
    aria-label={`Mais informações sobre ${code}`}
    data-testid="card-info-btn"
    type="button"
  >
    <svg>…ⓘ inline SVG…</svg>
  </button>
  ```
- Local state: `const [openInfo, setOpenInfo] = useState(false)`
- `handleInfoClick`: `e.stopPropagation(); setOpenInfo(v => !v)`
- `useEffect` on `document` mousedown to close on outside click; ref on article element
- Keydown `Escape` to close
- Popover JSX: `openInfo && <div className={styles.popover} role="tooltip">…name, source, freq, date…</div>`
- Popover positioned absolute top-right of card, pointing to icon area
- Animation: `@keyframes popoverIn` 160ms fade + slight translateY

**CSS additions in Card.module.css:**
- `.name` → remove or convert to visually-hidden (keep for aria-label on article, which already has name)
- `.infoBtn` — 32px touch target (padding to expand), no background/border, opacity 0.4, hover opacity 1
- `.popover` — absolute, z-index: 10, surface bg, shadow-md, border-radius md, padding space-3, max-width 220px
- `@keyframes popoverIn` — opacity 0→1, translateY(-4px)→0
