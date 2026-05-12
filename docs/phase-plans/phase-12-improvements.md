# Phase 12 — UI Improvements Plan

## Scope

Three UI improvement areas derived from improvements.md and user screenshots.

---

## 1. SmallMultiple — Unit label relocation

**Files:**
- `frontend/src/components/SmallMultiple/index.tsx` (EDIT)
- `frontend/src/components/SmallMultiple/SmallMultiple.module.css` (EDIT)

**Changes:**
- Wrap `code` span and new `unit` span inside a `.codeGroup` flex container (gap 8px, align baseline).
- `.unit` class: serif font, same size as `.code` (~0.875rem), color `rgba(11, 23, 48, 0.45)` (--ink-muted approximation).
- Remove inline unit render from `.valueRow` span.
- Result header: `[IBC-Br  índice] ............ [BCB SGS]`
- Value row becomes clean: `110,89  ▲ +0,66`

**Tests affected:** SmallMultiple.test.tsx — no assertion on unit position/placement, only on value text content. No test changes needed.

---

## 2. CalendarStrip — Scrollable 30-day strip

**Files:**
- `frontend/src/components/CalendarStrip/index.tsx` (EDIT)
- `frontend/src/components/CalendarStrip/CalendarStrip.module.css` (EDIT)
- `frontend/src/components/CalendarStrip/CalendarStrip.test.tsx` (EDIT — `toHaveLength(14)` → 30)
- `frontend/src/pages/Painel.tsx` (EDIT — section header text)

**Changes:**
- `STRIP_DAYS` constant: 14 → 30.
- `aria-label` on strip: "Próximas divulgações — 30 dias".
- CSS `.strip`: remove `grid-template-columns: repeat(14, minmax(0, 1fr))`, replace with `repeat(30, minmax(80px, 1fr))` — each cell min 80px forces scroll after ~10 visible.
- Scrollbar: visible `height: 8px`, thumb `var(--bg-deep)`, always shown (no `scrollbar-width: thin` auto-hide).
- Painel.tsx: change `"Agenda — próximos 14 dias"` → `"Agenda — próximos 30 dias"`.
- CalendarStrip test: `toHaveLength(14)` → `toHaveLength(30)`.

**Chip tests still pass:** mockReleases dates `2026-05-15` and `2026-05-20` are within 30 days of `startDate="2026-05-11"`, so chip rendering tests remain valid.

---

## 3. Sidebar — Width, visible toggle, dynamic fonts

**Files:**
- `frontend/src/components/Sidebar/Sidebar.module.css` (EDIT)
- `frontend/src/components/Sidebar/index.tsx` (no structural changes needed — toggle button already present)

**Changes:**
- `.sidebar` width: 240px → 280px.
- `.sidebar.collapsed` width: 68px → 72px.
- `.toggleBtn`: reposition from `right: calc(-1 * var(--space-4))` (outside bounds, clipped by overflow:hidden) to `right: 12px; top: 12px` (inside sidebar, always visible). Size: 32×32px. Add border `1px solid var(--bg-deep)` for visibility on dark bg. Contrast: use `var(--surface)` color for chevron on dark sidebar.
- `.brandName` font-size: `clamp(1.2rem, 1vw + 0.9rem, 1.6rem)` (was fixed 1.125rem).
- `.navLabel` font-size: `clamp(0.8rem, 0.3vw + 0.75rem, 0.95rem)` (was fixed 0.875rem).
- `.navHint` font-size: `clamp(0.65rem, 0.2vw + 0.6rem, 0.75rem)` (was fixed 0.5625rem).
- `.recentsLabel` / `.recentItem` font-size: keep current or add minor clamp.
- Brand area: add `padding-top` to `var(--space-8)` to leave room for the toggle button at top:12px.

**Tests affected:** Sidebar.test.tsx — zero assertions on width or font sizes. No test changes needed.

---

## Risk Analysis

| Risk | Mitigation |
|------|-----------|
| CalendarStrip `toHaveLength(14)` assertion | Update to 30 |
| Toggle button was outside sidebar due to `overflow:hidden` | Move inside, `right:12px` |
| Unit label removal from value breaks aria-label content | Keep aria-label on `<article>` as-is (already correct, reads value + unit from props) |
| 30-cell grid width on small screens | Each cell has `minmax(80px, 1fr)` — scrolls gracefully |

---

## Execution Order

1. SmallMultiple (index.tsx + CSS) — self-contained
2. CalendarStrip (index.tsx + CSS + test update)
3. Painel.tsx (header text only)
4. Sidebar (CSS only — toggle repositioned, widths, clamp fonts)
5. Run tests: `docker compose exec web npm run test`
6. Run typecheck: `docker compose exec web npm run typecheck`
