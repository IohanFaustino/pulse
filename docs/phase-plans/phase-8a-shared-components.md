# Phase 8a: Shared Frontend Components

**Agent:** react-specialist  **Wave:** W4a  **Skills:** react-expert, typescript-pro, frontend-design

---

## Files owned

### Create (new files)

#### Components
| Path | Purpose |
|---|---|
| `frontend/src/components/Sidebar/index.tsx` | Collapsible nav sidebar, 240px → 68px |
| `frontend/src/components/Sidebar/Sidebar.module.css` | Sidebar styles |
| `frontend/src/components/Sidebar/Sidebar.test.tsx` | Sidebar unit tests |
| `frontend/src/components/Sparkline/index.tsx` | Inline SVG sparkline, 24-obs |
| `frontend/src/components/Sparkline/Sparkline.module.css` | Sparkline styles |
| `frontend/src/components/Sparkline/Sparkline.test.tsx` | Sparkline unit tests |
| `frontend/src/components/Card/index.tsx` | Index card (catalog, Índices page) |
| `frontend/src/components/Card/Card.module.css` | Card styles |
| `frontend/src/components/Card/Card.test.tsx` | Card unit tests |
| `frontend/src/components/SmallMultiple/index.tsx` | Dense Painel card variant |
| `frontend/src/components/SmallMultiple/SmallMultiple.module.css` | SmallMultiple styles |
| `frontend/src/components/SmallMultiple/SmallMultiple.test.tsx` | SmallMultiple unit tests |
| `frontend/src/components/DeltaBadge/index.tsx` | Semantic financial delta |
| `frontend/src/components/DeltaBadge/DeltaBadge.module.css` | DeltaBadge styles |
| `frontend/src/components/DeltaBadge/DeltaBadge.test.tsx` | DeltaBadge unit tests |
| `frontend/src/components/CategoryToggle/index.tsx` | Pill → chip expansion toggle |
| `frontend/src/components/CategoryToggle/CategoryToggle.module.css` | CategoryToggle styles |
| `frontend/src/components/CategoryToggle/CategoryToggle.test.tsx` | CategoryToggle unit tests |
| `frontend/src/components/TransformModal/index.tsx` | 5 radio group transform modal |
| `frontend/src/components/TransformModal/TransformModal.module.css` | TransformModal styles |
| `frontend/src/components/TransformModal/TransformModal.test.tsx` | TransformModal unit tests |
| `frontend/src/components/CalendarStrip/index.tsx` | 14-day horizontal release strip |
| `frontend/src/components/CalendarStrip/CalendarStrip.module.css` | CalendarStrip styles |
| `frontend/src/components/CalendarStrip/CalendarStrip.test.tsx` | CalendarStrip unit tests |
| `frontend/src/components/LoadingSkeleton/index.tsx` | Shimmer skeleton primitives |
| `frontend/src/components/LoadingSkeleton/LoadingSkeleton.module.css` | Skeleton styles |
| `frontend/src/components/LoadingSkeleton/LoadingSkeleton.test.tsx` | Skeleton unit tests |
| `frontend/src/components/EmptyState/index.tsx` | Empty state w/ CTA |
| `frontend/src/components/EmptyState/EmptyState.module.css` | EmptyState styles |
| `frontend/src/components/EmptyState/EmptyState.test.tsx` | EmptyState unit tests |

#### Hooks
| Path | Purpose |
|---|---|
| `frontend/src/hooks/useSeries.ts` | GET /series with optional category filter |
| `frontend/src/hooks/useSeriesOne.ts` | GET /series/{code} |
| `frontend/src/hooks/useObservations.ts` | GET /series/{code}/observations |
| `frontend/src/hooks/useTransform.ts` | POST /series/{code}/transform |
| `frontend/src/hooks/useReleases.ts` | GET /releases |
| `frontend/src/hooks/useUserPrefs.ts` | GET + PATCH /user_prefs with helpers |
| `frontend/src/hooks/useDeltaSemantics.ts` | up/down/neutral per category rules |

#### Store
| Path | Purpose |
|---|---|
| `frontend/src/stores/uiStore.ts` | Zustand store: sidebarCollapsed, lastVisitedPage |

#### Lib
| Path | Purpose |
|---|---|
| `frontend/src/lib/formatPtBR.ts` | Intl pt-BR number/date formatters |
| `frontend/src/lib/categoryColor.ts` | category → CSS token mapping |
| `frontend/src/lib/deltaSemantics.ts` | Direction rule table per category |

#### Pages (stubs only — W4b fills)
| Path | Purpose |
|---|---|
| `frontend/src/pages/Painel.tsx` | Stub placeholder |
| `frontend/src/pages/Indices.tsx` | Stub placeholder |
| `frontend/src/pages/Calendario.tsx` | Stub placeholder |
| `frontend/src/pages/Metadados.tsx` | Stub placeholder |

### Edit (existing files)
| Path | Change |
|---|---|
| `frontend/src/App.tsx` | Replace HealthPage with full router shell + Layout + Sidebar + Routes |

---

## Interfaces

### Consumed (from prior phases)
- `frontend/src/api/schema.ts` — all generated types (SeriesRead, ObservationRead, ReleaseRead, UserPrefsRead, TransformRequest, etc.)
- `frontend/src/api/client.ts` — `apiClient` typed openapi-fetch instance
- `frontend/src/styles/tokens.css` — all CSS custom properties (no raw hex)
- `frontend/src/styles/globals.css` — font imports, reset
- Vite proxy `/api/*` → FastAPI at `http://api:8000`

### Produced (for downstream W4b page agents)
| Interface | Consumer | Description |
|---|---|---|
| All named component exports | W4b page agents | Painel, Índices, Calendário, Metadados import from `@/components/*` |
| All hooks | W4b page agents | Data fetching via `useQuery` / `useMutation` wrappers |
| `useUiStore` | Sidebar + pages | Sidebar collapse state |
| `formatPtBR`, `categoryColor`, `deltaSemantics` | All pages | Locale + semantic helpers |
| `TransformSpec` type | W4b Painel agent | Shape of transform spec emitted by TransformModal |

---

## Test strategy

| Component | Test cases |
|---|---|
| Sidebar | Renders 4 nav items; toggle adds `collapsed` data attr; active route highlighted |
| Sparkline | Empty array renders no path; N values renders polyline |
| Card | Renders code + value + DeltaBadge; star button calls onPin |
| SmallMultiple | Hover reveals unpin + modify buttons |
| CategoryToggle | Click expands; selecting chip fires onSelect callback |
| TransformModal | Renders 5 radio groups; Aplicar fires onApply with correct shape |
| CalendarStrip | Renders 14 day columns |
| DeltaBadge | Applies up class when category semantics say melhora |
| LoadingSkeleton | Smoke render |
| EmptyState | Renders CTA; clicking fires onAction |

---

## Acceptance criteria mapped

| Criterion | Test |
|---|---|
| Sidebar collapse 320ms per doc §9 | CSS transition on grid-template-columns |
| Chip stagger 18ms per doc §9 | CSS animation-delay inline style |
| Modal 220ms + scrim 160ms per doc §9 | CSS transition on modal card + scrim |
| All text pt-BR | Component render assertions |
| Design tokens only (no raw hex) | CSS module review |
| TanStack Query 5 patterns | queryOptions + useQuery + useMutation |
| Zustand 4 vanilla store | uiStore.ts |

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| `noUncheckedIndexedAccess` — array[0] can be undefined | Always use optional chaining + nullish coalescing |
| openapi-fetch response shape — data can be undefined | Guard with `if (!data) throw` pattern from client.ts |
| CSS Modules in tests — class names are mangled | Use `data-testid` + aria attrs for test selectors |
| TransformSpec params are `Record<string, never>` in schema | Cast to `Record<string, unknown>` in form logic only |

---

## Background services needed

| Service | Expected state |
|---|---|
| `api-web-1` | Running (port 5174→5173) |
| `api-api-1` | Running + healthy (for proxy) |
