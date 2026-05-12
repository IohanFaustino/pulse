# Phase 22 — Dark Mode + PT/EN Language Toggle

## Scope

Two sidebar features: theme (dark/light) persistence and PT/EN language toggle.

## File Ownership

| Action | File |
|--------|------|
| CREATE | `frontend/src/lib/i18n.ts` |
| EDIT   | `frontend/src/styles/tokens.css` — add `[data-theme="dark"]` block |
| EDIT   | `frontend/src/stores/uiStore.ts` — theme + lang state |
| EDIT   | `frontend/src/App.tsx` — apply `data-theme` attribute reactively |
| EDIT   | `frontend/src/components/Sidebar/index.tsx` — toggles + i18n |
| EDIT   | `frontend/src/components/Sidebar/Sidebar.module.css` — toggle styles |
| EDIT   | `frontend/src/components/Sidebar/Sidebar.test.tsx` — updated assertions |
| EDIT   | `frontend/src/lib/formatPtBR.ts` — lang-aware greeting |
| EDIT   | `frontend/src/pages/Painel.tsx` — translate via useTranslation |
| EDIT   | `frontend/src/pages/Indices.tsx` — translate visible chrome |
| EDIT   | `frontend/src/pages/Calendario.tsx` — translate visible chrome |
| EDIT   | `frontend/src/pages/Metadados.tsx` — translate visible chrome |

## Architecture Decisions

1. **Nav testids** must not use `item.label.toLowerCase()` (breaks when label changes
   between PT and EN). Switch to route-based key: `nav-item-${item.to.replace('/', '') || 'painel'}`.
   Existing tests already use `nav-item-painel`, `nav-item-índices`, `nav-item-calendário`,
   `nav-item-metadados` — these were based on the PT labels. We must preserve those exact
   testids. Strategy: keep a stable `id` field per nav item independent of the displayed label.

2. **localStorage** keys: `pulse:theme` and `pulse:lang`. Read on store init in the Zustand
   initializer (not in a useEffect). This makes SSR-safe too.

3. **`data-theme` sync**: Single `useEffect` in `App.tsx` watching `theme` from uiStore.
   Sets `document.documentElement.setAttribute('data-theme', theme)`. Also runs on mount to
   apply persisted value before first paint.

4. **`prefers-color-scheme` fallback**: In uiStore initializer, if `localStorage` has no
   `pulse:theme`, read `window.matchMedia('(prefers-color-scheme: dark)').matches`.

5. **i18n.ts** exports:
   - `type Lang = 'pt' | 'en'`
   - `STRINGS` const with full dict
   - `useTranslation()` hook reading `lang` + `setLang` from uiStore

6. **`greeting()` in formatPtBR** accepts an optional `lang` parameter. Default = `'pt'`
   so all existing callers (and test mocks) continue to work without change.

7. **Category names** stay in PT (proper Brazilian economic nouns).
   **Series codes and names** stay unchanged.

## Translation Keys (~40 keys)

### Sidebar
- `sidebar.nav.label.painel` → Painel / Panel
- `sidebar.nav.hint.painel` → visão macro / overview
- `sidebar.nav.label.indices` → Índices / Indexes
- `sidebar.nav.hint.indices` → workspace / workspace
- `sidebar.nav.label.calendario` → Calendário / Calendar
- `sidebar.nav.hint.calendario` → divulgações / releases
- `sidebar.nav.label.metadados` → Metadados / Metadata
- `sidebar.nav.hint.metadados` → dossiês / dossiers
- `sidebar.nav.aria` → Páginas / Pages
- `sidebar.recents` → Recentes / Recents
- `sidebar.toggle.collapse` → Colapsar menu / Collapse menu
- `sidebar.toggle.expand` → Expandir menu / Expand menu
- `sidebar.theme.toggle` → Alternar modo escuro / Toggle dark mode

### Painel
- `painel.calendar.title` → Agenda — próximos 30 dias / Agenda — next 30 days
- `painel.status.today` → índice com divulgação hoje / index with release today (+ plural)
- `painel.status.week` → esta semana / this week
- `painel.status.pinned` → índice fixado / pinned index (+ plural)

### Índices
- `indices.title` → índices / indexes
- `indices.search.placeholder` → Buscar por código ou nome… / Search by code or name…
- `indices.search.aria` → Buscar índices por código ou nome / Search indexes by code or name
- `indices.subtitle` → Use a estrela para adicionar ao Painel. / Use the star to add to Panel.
- `indices.count.one` → 1 índice / 1 index
- `indices.count.many` → {n} índices / {n} indexes

### Calendário
- `calendario.title` → Calendário de Divulgações / Release Calendar
- `calendario.today` → Hoje / Today

### Metadados
- `metadados.title` → metadados / metadata
- `metadados.select.prompt` → Selecione um índice / Select an index
- `metadados.field.fonte` → Fonte / Source
- `metadados.field.frequencia` → Frequência / Frequency
- `metadados.field.unidade` → Unidade / Unit
- `metadados.field.primeira_obs` → Primeira observação / First observation
- `metadados.field.ultima_div` → Última divulgação / Last release
- `metadados.field.proxima_div` → Próxima divulgação / Next release
- `metadados.field.calendario` → Calendário / Calendar
- `metadados.field.metodologia` → Metodologia / Methodology
- `metadados.field.site_oficial` → Site oficial / Official site
- `metadados.field.ver_calendario` → Ver Calendário / View Calendar
- `metadados.search.placeholder` → Buscar por código ou nome… / Search by code or name…
- `metadados.search.aria` → Buscar série / Search series

## Risk Register

| Risk | Mitigation |
|------|-----------|
| Sidebar testids break if label used | Use stable `id` field per nav item |
| Painel greeting test `/Bom dia|Boa tarde|Boa noite/` breaks in EN | Default lang is `pt`; uiStore test reset sets lang back to `pt` |
| `Calendario.test.tsx` mocks `greeting` | Mock covers both cases; no change needed |
| Zustand `setState` in tests resets lang | Add `lang: 'pt'` to beforeEach reset |

## Dark Mode Token Overrides

```css
[data-theme="dark"] {
  --bg: #0A1428;
  --bg-deep: #0F1D38;
  --surface: #152848;
  --ink: #E5E9F0;
  --ink-muted: rgba(229, 233, 240, 0.6);
  --navy: #6FB8FF;
  --accent: #2D62D4;
  --accent-2: #4A90E8;
  --accent-3: #8FCCFF;
  --up: #3DBA80;
  --down: #E27083;
  --grafite-1: #0D1520;
  --grafite-2: #1A2840;
  --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
}
```

## Sidebar Toggle Layout

```
[brand]
[nav items]
──────────────────
[theme + lang toggles row]  ← new between nav + recents
──────────────────
[recents]
[footer]
```

Toggle row collapsed: icons only, centered.
Toggle row expanded: sun/moon icon + "PT|EN" pills.
