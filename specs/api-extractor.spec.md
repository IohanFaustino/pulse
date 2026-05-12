# API-extractor — Feature Specification

**Version:** v1
**Date:** 2026-05-11
**Source design:** `API-extractor/DOCUMENTACAO.md`
**Common Ground:** `~/.claude/common-ground/home-iohan-Documents-projects-systems-API/`

---

## 1. Overview

Personal workspace for consulting and extracting 25 Brazilian economic indicators (IPCA, SELIC, CDI, IGP-M, PIB, PTAX, Ibovespa, etc.). System extracts data from BCB SGS, IBGE SIDRA, and B3/Yahoo Finance APIs on schedule, stores time series in Postgres+TimescaleDB, computes transforms on-demand, and serves a React/TS frontend with pinned-dashboard (Painel), catalog (Índices), release calendar (Calendário), and metadata dossier (Metadados).

**Target user:** single individual (project owner), local deployment.

**User value:**
- Centralized view of Brazilian macro indicators without manual checks across multiple sources
- Personal curation (pin/unpin) of relevant series
- On-demand statistical transforms (MoM/YoY/MA/EWMA/z-score) without leaving UI
- Forecast of upcoming releases via calendar

**Primary success metric:** 25/25 indicators ingested with full history since each series' first observation.

---

## 2. Scope

### In scope (v1)
- Extraction + storage pipeline for all 25 indices (full history backfill)
- Página Índices (catalog + search + tabs + pin/unpin via star)
- Painel (pinned-only dashboard with small-multiples, sparklines, delta, transform modal)
- Calendário (monthly grid with E/R events, category filters)
- Metadados (two-column dossier view)
- Transform modal (original, variation, smoothing, windows, normalization)
- Sidebar nav (collapse, recents, sync status)
- 14-day release strip on Painel

### Out of scope (v1)
- Multi-user accounts, authentication, RBAC
- Single-index workspace deep view (card click → stub only)
- Export to CSV/Excel
- Alerts/notifications on releases
- Mobile responsive design (desktop-first)

---

## 3. Functional Requirements (EARS)

### FR-1 — Extraction

- **FR-1.1** When APScheduler triggers an extraction job per series frequency, the system shall fetch new observations from the configured source (BCB SGS / IBGE SIDRA / B3 / Yahoo).
- **FR-1.2** When a series has no stored observations, the system shall backfill from the series' first observation through current date.
- **FR-1.3** When an extraction request fails, the system shall retry up to 3 times with exponential backoff (2s, 8s, 30s).
- **FR-1.4** When all 3 retries fail, the system shall mark the series as `stale`, log the failure with source/error, and continue with other series.
- **FR-1.5** The system shall record `last_extraction_at`, `last_success_at`, and `status` (`fresh` | `stale` | `failed`) per series.
- **FR-1.6** Where a series has frequency `daily`, the system shall schedule extraction at 18:00 BRT (after market close).
- **FR-1.7** Where a series has frequency `monthly`, the system shall schedule daily polling for new releases (releases not always exactly on calendar date).

### FR-2 — Storage

- **FR-2.1** The system shall store observations in a TimescaleDB hypertable partitioned by `observed_at`.
- **FR-2.2** Where an observation already exists for `(series_id, observed_at)`, the system shall update the value only if the upstream value differs (revisions).
- **FR-2.3** The system shall record revision history (before/after value + revised_at timestamp) for any observation update.

### FR-3 — Transforms

- **FR-3.1** When a transform is requested via API, the system shall compute the transform from raw stored observations using pandas.
- **FR-3.2** When a transform window contains NaN/null observations, the system shall skip those points and flag the gap in response metadata.
- **FR-3.3** The system shall support transform groups per design doc §7: original (level, sazonal adj, calendar adj), variation (MoM, QoQ, YoY, annualized, first diff, log-diff, p.p.), smoothing (MA-3/6/12, EWMA), windows (12m accum, 12m stddev), normalization (rebase=100, z-score, percentile).
- **FR-3.4** When the same `(series_id, transform_spec)` is requested again within TTL, the system shall return cached result from Redis.
- **FR-3.5** The system shall set Redis TTL based on series frequency: daily=1h, monthly=24h, quarterly=7d.

### FR-4 — Pin/Unpin

- **FR-4.1** When the user clicks the star on an Índices card, the system shall add the series to `user_prefs.pinned_series` and remove it from the Índices catalog view.
- **FR-4.2** When the user clicks the unpin (gold star) on a Painel small-multiple, the system shall remove the series from pins and restore it to the Índices catalog.
- **FR-4.3** The system shall persist pin state in Postgres `user_prefs` table (single default user row).
- **FR-4.4** Where no series is pinned, the system shall render the Painel empty state inviting the user to visit Índices.

### FR-5 — Painel rendering

- **FR-5.1** The system shall render a small-multiple per pinned series containing: code, source, sparkline (last 24 observations frequency-aware), current value, delta vs previous observation (% change).
- **FR-5.2** Where the category filter is `Todos`, the system shall group small-multiples by category with titles.
- **FR-5.3** Where a category filter is active, the system shall render a flat grid filtered to that category.
- **FR-5.4** When a small-multiple is hovered, the system shall reveal the unpin (right) and modify (left) buttons.
- **FR-5.5** Where a transform is active on a card, the system shall display a transform badge below the delta.
- **FR-5.6** The system shall apply delta color semantics: red = piora, green = melhora, per category-specific rules (e.g., higher unemployment = piora; higher Ibov = melhora).

### FR-6 — Calendário

- **FR-6.1** The system shall display a 7-column monthly grid (dom→sáb) with date cells containing up to 6 event chips, with `+N` overflow indicator.
- **FR-6.2** Where an event is in the past (relative to today), the system shall render it as `R` (realized, red).
- **FR-6.3** Where an event is in the future, the system shall render it as `E` (expected, green).
- **FR-6.4** When user clicks `‹` or `›`, the system shall navigate to previous/next month and update R/E counters.
- **FR-6.5** Where today falls in the visible month, the system shall render today's cell with navy border + sky number.
- **FR-6.6** The system shall fetch official release calendars (IBGE, BCB) when available; otherwise it shall use a hardcoded annual schedule keyed by series.
- **FR-6.7** Where a series has frequency `daily`, the system shall exclude it from the Calendário (per doc §5).

### FR-7 — Metadados

- **FR-7.1** The system shall display a two-column layout: left sticky filtered list, right detailed dossier.
- **FR-7.2** When a user selects a series in the left list, the system shall render the dossier with code, name, category chip, editorial description, fields grid (Fonte, Frequência, Unidade, Primeira obs, Última divulgação, Próxima divulgação, Calendário, Metodologia, Site oficial), and snapshot (current value hero + sparkline).

### FR-8 — Transform modal

- **FR-8.1** When the user clicks the modify button on a Painel small-multiple, the system shall open the transform modal pre-populated with the card's current transform.
- **FR-8.2** When the user clicks Aplicar, the system shall persist the transform spec in `user_prefs.card_transforms[series_id]` and re-render the card.
- **FR-8.3** When the user clicks Cancelar, the system shall close the modal without changes.

### FR-9 — Sidebar

- **FR-9.1** When the toggle button is clicked, the system shall collapse the sidebar from 240px → 68px (or expand) over 320ms.
- **FR-9.2** Where the sidebar is collapsed, the system shall hide labels, hints, and recents; dots and icons shall remain.
- **FR-9.3** The system shall maintain a `recents` list of up to 3 last-consulted indices and persist across sessions.

---

## 4. Non-Functional Requirements

### NFR-1 — Performance
- The system shall respond to `GET /series/{code}/observations` within 200ms p95 for cached requests.
- The system shall respond to `POST /series/{code}/transform` within 800ms p95 for uncached requests (≤ 100k observations).
- The system shall load the Painel initial render within 1.5s on local network.

### NFR-2 — Reliability
- The system shall log all extraction attempts (success and failure) with structured JSON logs.
- The system shall expose a `/health` endpoint returning per-series freshness status.
- The system shall not lose observations on application restart (Postgres persistence).

### NFR-3 — Security
- The system shall validate all date inputs server-side (ISO-8601, range bounds).
- The system shall not expose source-API credentials in client responses or logs.
- Where multi-user expansion is added later, the system shall require authentication on all `/series/*` and `/user_prefs/*` endpoints.

### NFR-4 — Data integrity
- The system shall enforce `UNIQUE(series_id, observed_at)` constraint at DB level.
- The system shall maintain referential integrity between `user_prefs.pinned_series` and `series.id` via FK.

### NFR-5 — Localization
- All UI copy shall be in pt-BR.
- All date formatting shall use pt-BR locale (`pt-BR` Intl).
- Code, identifiers, and source comments shall be in English.

---

## 5. Acceptance Criteria (Given / When / Then)

### AC-1 — Backfill on first run
```
Given the system starts with an empty database,
When the operator runs the bootstrap command,
Then all 25 series shall be backfilled from their first observation,
And each series' last observation date shall be ≤ 24h behind upstream source.
```

### AC-2 — Pin to Painel
```
Given the user is on Índices and IPCA appears in the catalog,
When the user clicks the star icon on the IPCA card,
Then IPCA shall appear on Painel within 200ms,
And IPCA shall no longer appear in the Índices catalog,
And the pin state shall persist after page reload.
```

### AC-3 — Transform application
```
Given the user has IPCA pinned on Painel showing level values,
When the user opens the transform modal, selects "YoY", and clicks Aplicar,
Then the small-multiple shall re-render with YoY values,
And a "YoY" badge shall appear below the delta,
And the transform shall persist after reload.
```

### AC-4 — Extraction failure resilience
```
Given the BCB SGS API is unreachable,
When the scheduled SELIC extraction runs,
Then the system shall retry 3 times with exponential backoff,
And after final failure, the SELIC series.status shall be set to "stale",
And the failure shall be logged with error details,
And other (non-BCB) series extractions shall continue unaffected.
```

### AC-5 — Calendar navigation
```
Given the user is on Calendário viewing the current month,
When the user clicks "›",
Then the grid shall update to the next month,
And the R/E counters in the header shall reflect that month's events,
And future-month events shall all display as "E" (expected, green).
```

### AC-6 — Transform NaN handling
```
Given IPCA has a missing observation in month M,
When the user requests YoY transform with month M in the window,
Then the system shall skip the NaN points in computation,
And the response metadata shall include {"gaps": [{"date": "M", "reason": "missing_upstream"}]}.
```

### AC-7 — Empty Painel
```
Given the user has no pinned series,
When the user navigates to Painel,
Then the system shall render the empty state with a CTA to visit Índices,
And the 14-day calendar strip shall fall back to showing all series (per doc §3).
```

---

## 6. Error Handling

| Error condition | HTTP code | UI behavior | Logging |
|----|----|----|----|
| Upstream API timeout | — | Series chip shows `stale` badge | WARN + retry |
| Upstream API permanent error | — | Series chip shows `failed` badge | ERROR |
| Transform requested on missing series | 404 | Modal shows "série não encontrada" | INFO |
| Transform requested with invalid spec | 422 | Modal shows validation error | INFO |
| Pin limit exceeded (N/A in v1) | 409 | n/a | — |
| DB connection lost | 503 | Banner "sincronização perdida" + retry | ERROR |
| Cache miss | — | Compute fresh, log timing | DEBUG |
| Calendar scrape fails | — | Fallback to hardcoded schedule | WARN |

---

## 7. Implementation TODO Checklist

### Phase 0 — Infrastructure
- [ ] Docker Compose: Postgres 16 + TimescaleDB + Redis 7
- [ ] FastAPI project skeleton with Pydantic v2
- [ ] APScheduler integration
- [ ] Alembic migrations setup
- [ ] Structured JSON logging (loguru or stdlib)

### Phase 1 — Data layer
- [ ] DB schema: `series`, `observations` (hypertable), `revisions`, `releases`, `user_prefs`
- [ ] Seed 25 series metadata (code, name, category, source, source_id, frequency, unit, first_obs)
- [ ] Migrations + Timescale hypertable creation
- [ ] Repository layer (CRUD per entity)

### Phase 2 — Extractors
- [ ] BCB SGS client (`https://api.bcb.gov.br/dados/serie/bcdata.sgs.{id}/dados`)
- [ ] IBGE SIDRA client
- [ ] B3 / Yahoo Finance client
- [ ] Retry logic with tenacity (3x exp backoff)
- [ ] Backfill command (`python -m api_extractor.bootstrap`)
- [ ] Stale detection + status update
- [ ] Pytest: contract tests per source

### Phase 3 — Transforms
- [ ] Transform registry mapping spec → pandas operation
- [ ] Original series passthrough + sazonal/calendar adj stubs
- [ ] Variation: MoM, QoQ, YoY, annualized, diff, log-diff, p.p.
- [ ] Smoothing: MA-3/6/12, EWMA
- [ ] Windows: 12m accum, 12m stddev
- [ ] Normalization: rebase=100, z-score, percentile
- [ ] Redis caching with TTL per frequency
- [ ] NaN gap detection + metadata
- [ ] Pytest: numeric correctness vs reference values

### Phase 4 — API
- [ ] `GET /series` — list all with metadata + status
- [ ] `GET /series/{code}/observations?from=&to=`
- [ ] `POST /series/{code}/transform` — body: TransformSpec
- [ ] `GET /releases?month=YYYY-MM` — calendar events
- [ ] `GET /user_prefs` + `PATCH /user_prefs`
- [ ] OpenAPI schema export
- [ ] `GET /health` per-series freshness
- [ ] Pytest: API contract tests

### Phase 5 — Frontend (Vite + React + TS)
- [ ] Vite scaffold + Tailwind or plain CSS preserving doc tokens
- [ ] `openapi-typescript` codegen pipeline
- [ ] Fonts: Instrument Serif, IBM Plex Sans/Mono
- [ ] Color tokens from doc §8 as CSS variables
- [ ] Sidebar component with collapse animation
- [ ] Router (state-based per doc, or react-router)
- [ ] Page: Índices (search, tabs, card grid, star pin)
- [ ] Page: Painel (small-multiples, category toggle, 14-day strip)
- [ ] Page: Calendário (month grid, E/R chips, nav, filters)
- [ ] Page: Metadados (two-column, dossier)
- [ ] Component: TransformModal
- [ ] Component: Sparkline (SVG, 24 obs)
- [ ] Motion: per doc §9 (320ms sidebar, 18ms chip stagger, 220ms modal)
- [ ] Empty states for Painel + Índices

### Phase 6 — Polish
- [ ] Localization (pt-BR Intl for dates/numbers)
- [ ] Recents tracking in user_prefs
- [ ] Sync indicator (footer dot pulse + last_sync timestamp)
- [ ] Manual refresh button
- [ ] Bootstrap docs (README)

### Phase 7 — Verification
- [ ] All 25 series ingested with full history
- [ ] All 7 acceptance criteria pass
- [ ] Manual smoke: pin → transform → unpin flow
- [ ] Calendar shows ≥ 2 months of E events
