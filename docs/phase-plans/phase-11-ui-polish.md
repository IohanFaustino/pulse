# Phase 11 — UI/UX Sizing & Position Polish (Painel)

**Date:** 2026-05-11  
**Viewport:** 1570×1101  
**Scope:** Painel page density, spacing, card height, sparkline readability, calendar uniformity

---

## Before (live Chrome measurements)

| Element | Before |
|---|---|
| SmallMultiple card | 230×99px |
| Sparkline SVG | 140×24px |
| CalendarStrip | 1216×77px (irregular day chip widths) |
| Card min-width (grid) | minmax(200px, 1fr) |

## Target (after)

| Element | Target |
|---|---|
| SmallMultiple card | 280px min-width × ≥160px height |
| Sparkline SVG | 200×56px |
| CalendarStrip day cell | (container / 14) ≈ 86px each, uniform grid |
| Card min-height | 160px |

---

## File Ownership

| File | Change |
|---|---|
| `frontend/src/components/Sparkline/index.tsx` | Default props: width=200, height=56 |
| `frontend/src/components/Sparkline/Sparkline.module.css` | stroke-width bump, dot radius |
| `frontend/src/components/SmallMultiple/SmallMultiple.module.css` | min-height 160px, grid layout, gap rhythm |
| `frontend/src/components/SmallMultiple/index.tsx` | Sparkline props: width=200 height=56 |
| `frontend/src/components/CalendarStrip/CalendarStrip.module.css` | grid layout, uniform widths, min-height |
| `frontend/src/components/Sidebar/Sidebar.module.css` | nav gap 4px→12px, item padding 10px y |
| `frontend/src/pages/Painel.module.css` | grid minmax(280px), category gap 32px |

**Read-only (no edits):** `tokens.css`, routers/, backend, schema.ts

---

## Spacing Decisions (4/8pt grid)

- Card padding: 16px horizontal, 12px vertical (was space-3/space-4 = 12/16)
- Card internal gap: 8px between rows (space-2)
- Card value font: 1.75rem (28px) — up from 1.125rem
- Sparkline: 200×56 — 2.3× wider and 2.3× taller than before
- Strip cell: grid not flex, repeat(14, minmax(0, 1fr)), min-height 96px
- Sidebar nav gap: space-3 (12px), item padding-y 10px
- Category section margin-bottom: space-8 (32px)

---

## Preserved

- All color tokens (--navy, --accent-*, --up, --down, etc.)
- All motion tokens (--duration-sidebar 320ms, --duration-modal 220ms, --duration-chip 18ms)
- pt-BR copy text unchanged
- No new dependencies
- Vanilla CSS Modules only

---

## Open Questions

- Mobile breakpoints: not in current code — no responsive breakpoints added in this phase. Grid `auto-fill minmax(280px,1fr)` provides natural reflow. Explicit `@media` pass deferred.
- Touch targets: action buttons bumped to 32×32px (≥44pt ideally deferred to pointer-only use case since this is a desktop-first dashboard).
