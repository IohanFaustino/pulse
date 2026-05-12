# API-extractor — User Manual

**Project:** Personal workspace for Brazilian economic indicators (IPCA, SELIC, CDI, IGP-M, PIB, PTAX, Ibovespa, etc.)
**Deploy:** local single-user, Docker Compose

---

## 1. Service map

| Service | URL | Purpose |
|---|---|---|
| **Web UI** (Vite + React) | http://localhost:5174 | 4-page workspace |
| **API** (FastAPI) | http://localhost:8000 | REST endpoints |
| **Swagger UI** | http://localhost:8000/docs | Interactive API explorer |
| **ReDoc** | http://localhost:8000/redoc | Pretty API reference |
| **OpenAPI schema** | http://localhost:8000/openapi.json | Machine-readable spec |
| **Postgres** | localhost:5433 | DB (timescaledb) |
| **Redis** | localhost:6379 | Transform cache |

Default credentials: `postgres / postgres` / db `api_extractor`. No auth on API (single-user local).

---

## 2. Lifecycle commands

All run from project root: `/home/iohan/Documents/projects/systems/API`

```bash
make up           # start all 4 services
make down         # stop all (volumes preserved)
make logs         # tail aggregated logs
make migrate      # alembic upgrade head
make seed         # load 25 series metadata
make test         # full pytest suite
make fmt          # ruff format
make lint         # ruff check
make typecheck    # mypy
```

Direct docker compose (when Makefile missing target):
```bash
docker compose ps                          # service health
docker compose restart api                 # restart one service
docker compose exec api bash               # shell into api
docker compose exec postgres psql -U postgres -d api_extractor
docker compose down -v                     # WIPE all data (volumes)
```

---

## 3. First-time bootstrap

```bash
cd /home/iohan/Documents/projects/systems/API
make up                                    # start stack
# wait ~15s for postgres healthcheck
make migrate                               # apply schema migrations
make seed                                  # load 25 series metadata
curl -X POST http://localhost:8000/admin/backfill --max-time 300
# fetches full history for all 25 series (~30-60s)
curl -X POST http://localhost:8000/admin/refresh-calendar
# scrape IBGE + load BCB hardcoded releases
open http://localhost:5174                 # or browse manually
```

After bootstrap: scheduler runs automatically (daily 18:00 BRT, monthly poll 09:00 BRT, calendar refresh Sun 03:00 BRT).

---

## 4. Web UI usage (http://localhost:5174)

### Sidebar (left, 240px)
- 4 nav links: **Painel** · **Índices** · **Calendário** · **Metadados**
- Toggle (circular button top-right of sidebar) collapses to 68px
- Recents (last 3 visited series)
- Footer: sync indicator dot + last-sync timestamp from `/health`

### Painel (`/`) — pinned dashboard
- Shows only series you have **pinned**
- Greeting "Bom dia." + pt-BR date
- Status line: today's releases · this week · pin count
- **Category toggle** pill: filter Todos / Inflação / Atividade / etc.
- Grid of small-multiples per pinned series:
  - **Star icon (right, on hover)** → unpin (returns to Índices)
  - **Modify icon (left, on hover)** → open transform modal
  - Sparkline (24 obs) + current value + delta % + transform badge if active
- Top-right **🔄 Atualizar** button → triggers full backfill
- 14-day calendar strip at bottom shows upcoming releases for pinned series
- **Empty state** if nothing pinned: CTA → go to Índices

#### Diariamente section (under calendar)
- Horizontal scrollable row of 7 chips for daily-frequency series
- Series listed: **SELIC, CDI, TR, PTAX_USD, PTAX_EUR, Ibovespa, IFIX**
- Each chip shows: code, last value + unit, delta, mini sparkline (24px), source badge, freshness dot
- Freshness dot: green (≤24h), amber (24–72h), red (>72h)
- Click any chip → opens AnalysisPanel (same as card click)
- Updated automatically by scheduler job `daily_batch` (Mon–Fri 18:00 BRT)

### Índices (`/indices`) — catalog (title: "índices")
- Page is **fixed to viewport**, scroll happens inside the card grid
- Shows all series **not** pinned (search by code or name, real-time)
- 13 category chips (Todos + 12 cats); chips render as floating panel **below** the pill — pill anchored, no row jump
- Each card has:
  - **ⓘ info icon** (left) → click opens popover w/ full name + source + freq + last update
  - **★ star** (right) → pin to Painel
  - Click **card body** → opens **AnalysisPanel** (no navigation away)
- When category filter ≠ Todos: cards **cluster by source** (BCB SGS / IBGE SIDRA / Yahoo / B3 / ANBIMA) with source heading
- Empty state when all pinned: "Todos os índices estão fixados no Painel"

### Calendário (`/calendario`) — release calendar + daily table
- Page **fixed to viewport** w/ internal scrollArea
- Header: month + year `<select>` cards (10y span), ‹ / › / Hoje, R/E counters
- Category filter chips (13 cats)
- 7-column month grid (Dom→Sáb)
- Per-day cell:
  - ≤ 3 releases → all chips visible (E green / R red)
  - > 3 releases → 1st chip + `+N` overflow button
  - Click any cell w/ releases → **DayDetailModal** lists all releases that day (E/R badge, category chip, source)
- Today: navy border, sky number; weekend dim
- **DailyTable** below grid ("Coletados diariamente"): all 54 daily/event series w/ code · source · last collection (relative pt-BR "há 2h") · status dot. Click row → AnalysisPanel
- Daily series excluded from grid (FR-6.7) — they appear only in the DailyTable

### Metadados (`/metadados?code=X`) — dossier
- Page **fixed to viewport**, two scrollable columns
- Title: **"metadados"** (greeting removed)
- Toolbar: search + 13 category chips
- Two-column body:
  - **Left (280px)**: filtered list of all 72 series, scrolls internally
  - **Right**: dossier or empty state if no `?code=X`
- When category ≠ Todos: left list groups by source (heading per source)
- Click left item → right pane updates + URL syncs `?code=…`
- Dossier fields: Fonte · Frequência · Unidade · Primeira obs · Última divulgação · Próxima divulgação (navy highlight) · Calendário · Metodologia · Site oficial
- Snapshot: hero value + sparkline (24 obs)

---

## 5. API endpoints

### Series + observations (read)

```bash
# List all 25 series + status + next_release_at
curl http://localhost:8000/series | jq

# Single series metadata
curl http://localhost:8000/series/IPCA | jq

# Observations (date-range + limit)
curl "http://localhost:8000/series/IPCA/observations?from=2020-01-01&to=2026-05-01&limit=100" | jq
curl "http://localhost:8000/series/IPCA/observations?limit=24" | jq   # last 24 for sparkline
```

### Transforms (POST body)

```bash
# Year-over-year on IPCA
curl -X POST http://localhost:8000/series/IPCA/transform \
  -H 'Content-Type: application/json' \
  -d '{"op":"yoy"}' | jq

# Moving average window=6 on SELIC
curl -X POST http://localhost:8000/series/SELIC/transform \
  -H 'Content-Type: application/json' \
  -d '{"op":"ma","params":{"window":6}}' | jq

# z-score normalization
curl -X POST http://localhost:8000/series/Ibovespa/transform \
  -H 'Content-Type: application/json' \
  -d '{"op":"zscore"}' | jq
```

**Available ops:** `level`, `sa`, `calendar_adj`, `mom`, `qoq`, `yoy`, `annualized`, `diff`, `log_diff`, `pp`, `ma`, `ewma`, `accum12`, `stddev12`, `rebase`, `zscore`, `percentile`

Response includes `values: [{date,value}]` + `metadata: {gaps, cached, latest_observed_at, ...}`.

### Releases (calendar)

```bash
curl "http://localhost:8000/releases?month=2026-05" | jq
curl "http://localhost:8000/releases?month=2026-06&category=Inflação" | jq
```

### User prefs (pin / unpin / transforms / recents)

```bash
# Read prefs
curl http://localhost:8000/user_prefs | jq

# Pin IPCA + SELIC
curl -X PATCH http://localhost:8000/user_prefs \
  -H 'Content-Type: application/json' \
  -d '{"pins":[{"series_code":"IPCA","order":0},{"series_code":"SELIC","order":1}]}'

# Save a transform on a card
curl -X PATCH http://localhost:8000/user_prefs \
  -H 'Content-Type: application/json' \
  -d '{"card_transforms":[{"series_code":"IPCA","transform_spec":{"op":"yoy","params":{}}}]}'

# Update recents
curl -X PATCH http://localhost:8000/user_prefs \
  -H 'Content-Type: application/json' \
  -d '{"recents":["IPCA","SELIC","PTAX_USD"]}'
```

### Admin (extraction + scheduler)

```bash
# Manually extract ONE series
curl -X POST http://localhost:8000/admin/extract/IPCA | jq

# Backfill ALL 25 series (sequential w/ semaphore 3, ~30-60s)
curl -X POST http://localhost:8000/admin/backfill --max-time 300 | jq

# Backfill specific codes
curl -X POST 'http://localhost:8000/admin/backfill?codes=IPCA&codes=SELIC' | jq

# Backfill since date
curl -X POST 'http://localhost:8000/admin/backfill?since=2025-01-01' | jq

# Refresh release calendar (scrape IBGE + reload hardcoded)
curl -X POST http://localhost:8000/admin/refresh-calendar | jq

# List scheduler jobs
curl http://localhost:8000/admin/scheduler/jobs | jq

# Manually fire a scheduler job
curl -X POST http://localhost:8000/admin/scheduler/trigger/calendar_refresh | jq
curl -X POST http://localhost:8000/admin/scheduler/trigger/daily_batch | jq
curl -X POST http://localhost:8000/admin/scheduler/trigger/periodic_batch | jq
```

### Health

```bash
curl http://localhost:8000/health | jq
# { "status": "ok" | "degraded", "sync_at": "...", "series_freshness": {...} }
```

---

## 6. Scheduler

Three cron jobs run inside the FastAPI process (timezone America/Sao_Paulo):

| Job ID | Schedule | Purpose |
|---|---|---|
| `daily_batch` | Mon-Fri 18:00 BRT | All daily + event series w/ status ≠ failed (54 codes: 6 BCB + 9 Yahoo + 8 B3 portal + 30 ANBIMA + 1 event) |
| `periodic_batch` | Daily 09:00 BRT | All monthly + quarterly series (poll for new releases) |
| `calendar_refresh` | Sun 03:00 BRT | Re-scrape IBGE + BCB release calendars |

State persisted in `apscheduler_jobs` Postgres table — survives `docker compose restart`.

Disable scheduler: set `SCHEDULER_ENABLED=false` in `.env` and restart api.

---

## 7. The 72 series (12 categories)

### Brazilian macroeconomic (26)

| Code | Source | Freq | Category |
|---|---|---|---|
| IPCA, IPCA-15, IGP-M, IGP-DI, INPC | BCB SGS | monthly | Inflação |
| SELIC, CDI, TR | BCB SGS | daily | Juros |
| SELIC_meta | BCB SGS | event | Juros |
| PTAX_USD, PTAX_EUR | BCB SGS | daily | Câmbio |
| Ibovespa, IFIX | Yahoo Finance | daily | Mercado |
| PIB_Nominal | IBGE SIDRA (1846/v585) | quarterly | Atividade |
| PIB_Real | IBGE SIDRA (6612/v9318) | quarterly | Atividade |
| IBC-Br | BCB SGS | monthly | Atividade |
| Prod_Industrial, Vendas_Varejo | IBGE SIDRA | monthly | Atividade |
| Desemprego, Rendimento_Medio | IBGE SIDRA | quarterly | Trabalho |
| CAGED | BCB SGS | monthly | Trabalho |
| Resultado_Primario, Divida_Bruta | BCB SGS | monthly | Fiscal |
| Balanca_Comercial, Reservas_Internacionais, Conta_Corrente | BCB SGS | monthly | Externo |

### Renda Fixa — ANBIMA bulk XLSX (30, daily)

| Family | Codes |
|---|---|
| **IMA** (9) | IMA-Geral, IMA-Geral_ex-C, IMA-B, IMA-B_5, IMA-B_5plus, IMA-B_5_P2, IRF-M, IRF-M_1, IRF-M_1plus |
| **IRF-M sub-quotas** (2) | IRF-M_P2, IRF-M_P3 |
| **IMA-S + IHFA** (2) | IMA-S, IHFA (Hedge Funds) |
| **IDA debêntures** (8) | IDA_Geral, IDA_DI, IDA_IPCA, IDA_IPCA_Infra, IDA_IPCA_ExInfra, IDA_Liq_Geral, IDA_Liq_DI, IDA_Liq_IPCA, IDA_Liq_IPCA_Infra |
| **IDKA** (8) | IDKA_PRE_3M/1A/2A/3A/5A · IDKA_IPCA_2A/3A/5A |

### B3 portal (8, daily)

| Code | Source | Category |
|---|---|---|
| IBrX_50, IBrX_100 | B3 (IBXL, IBXX) | Mercado |
| ISE_B3, ICO2_B3 | B3 | Sustentabilidade |
| IGC_B3, IGCT_B3, IGC_NM_B3, ITAG_B3 | B3 | Governança |

### Mercado Internacional + ESG via Yahoo Finance (8, daily)

| Code | Ticker | Currency | Category |
|---|---|---|---|
| SP500 | ^GSPC | USD | Mercado Internacional |
| DJIA | ^DJI | USD | Mercado Internacional |
| Nasdaq_Composite | ^IXIC | USD | Mercado Internacional |
| Nasdaq_100 | ^NDX | USD | Mercado Internacional |
| MSCI_World | URTH (ETF proxy) | USD | Mercado Internacional |
| MSCI_EM | EEM (ETF proxy) | USD | Mercado Internacional |
| Euro_Stoxx_50 | ^STOXX50E | EUR | Mercado Internacional |
| SP500_ESG | ^SPESG | USD | Sustentabilidade |

Details per source: `docs/data-sources/{bcb-sgs,ibge-sidra,b3-yahoo,b3-indexes,intl-indexes,anbima-ima,calendar}.md`

### Series schema fields (Phase 20)

Every series record has:
- `code` (PK), `name`, `category`, `source`, `source_id`
- `frequency` ∈ {daily, monthly, quarterly, event}
- `unit` (e.g. "% a.m.", "R$ mi", "pontos", "índice")
- **`currency`** ∈ {BRL, USD, EUR} *(default BRL)*
- **`is_proxy`** bool — true if value tracks an ETF proxy rather than the index directly (IFIX, MSCI_World, MSCI_EM)
- `first_observation` date
- `status` ∈ {fresh, stale, failed}
- `last_extraction_at`, `last_success_at`, `measures` jsonb (Phase 18 — currently `[]` for all)

---

## 8. Database direct access

```bash
docker compose exec postgres psql -U postgres -d api_extractor
```

Useful queries:
```sql
-- Per-series counts + date range
SELECT series_code, COUNT(*) AS n, MIN(observed_at)::date AS first, MAX(observed_at)::date AS last
FROM observations GROUP BY series_code ORDER BY series_code;

-- Stale series
SELECT code, status, last_success_at FROM series WHERE status != 'fresh';

-- Recent revisions
SELECT * FROM revisions ORDER BY revised_at DESC LIMIT 20;

-- Future releases
SELECT series_code, scheduled_for, status, source_type
FROM releases WHERE scheduled_for >= CURRENT_DATE
ORDER BY scheduled_for LIMIT 30;

-- Scheduler jobs
SELECT id, to_timestamp(next_run_time) AS next_run FROM apscheduler_jobs;
```

---

## 9. Common workflows

### Pin a series via API (no UI)
```bash
curl -X PATCH http://localhost:8000/user_prefs \
  -H 'Content-Type: application/json' \
  -d '{"pins":[{"series_code":"IPCA","order":0}]}'
```
Open http://localhost:5174 → Painel shows IPCA.

### Get YoY inflation series
```bash
curl -X POST http://localhost:8000/series/IPCA/transform \
  -H 'Content-Type: application/json' \
  -d '{"op":"yoy"}' | jq '.values[-12:]'
```

### Force refresh after upstream release
```bash
curl -X POST http://localhost:8000/admin/extract/IPCA
```
Or via UI: Painel → **🔄 Atualizar** button.

### Daily check workflow
1. Open http://localhost:5174/calendario → see today's releases
2. Painel → check sparklines for pinned series
3. Click into Metadados for full dossier on any series

---

## 10. Troubleshooting

### Services not responding
```bash
docker compose ps                          # check health
docker compose logs api --tail=50          # api logs
docker compose logs postgres --tail=30
docker compose restart api                 # full restart
```

### Port conflicts (5433 / 5174)
Host ports remapped because 5432 and 5173 were taken on this machine. See `docker-compose.yml`. Internal container ports unchanged.

### Series stuck stale
```bash
# Trigger manual extract
curl -X POST http://localhost:8000/admin/extract/SELIC
# If still failing, check upstream:
docker compose exec api curl -v "https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/5?formato=json"
```

### Transform cache stale (rare — cache key includes latest_observed_at so usually auto-invalidates)
```bash
docker compose exec redis redis-cli FLUSHALL
```

### Migration drift
```bash
docker compose exec api alembic current    # show head
docker compose exec api alembic upgrade head
```

### Reset everything
```bash
docker compose down -v                     # NUKE volumes
make up && make migrate && make seed
curl -X POST http://localhost:8000/admin/backfill --max-time 300
curl -X POST http://localhost:8000/admin/refresh-calendar
```

### yfinance issues (Yahoo blocks UA / delisted ticker)
- IFIX uses proxy `XFIX11.SA` (ETF tracking, not the index itself)
- If Yahoo blocks: wait minutes, retry. Library version pinned at 1.3.0.

---

## 11. Logs

All structured JSON via loguru → stdout → captured by Docker:
```bash
docker compose logs -f api | grep extraction
docker compose logs -f api | grep ERROR
docker compose logs -f api | grep -E "job\.(start|done|failed)"
```

Useful patterns:
- `extraction.start` / `extraction.ok` / `extraction.failed`
- `job.start` / `job.done` / `job.failed` (scheduler)
- `transform.cache_hit` / `transform.cache_miss`

---

## 12. Files of interest

| Path | What |
|---|---|
| `docs/PLAN.md` | Build plan + waves + agent matrix |
| `docs/architecture/system-design.md` | System diagrams |
| `docs/adr/` | 8 ADRs |
| `docs/data-sources/` | Per-source API docs |
| `specs/api-extractor.spec.md` | EARS spec + acceptance criteria |
| `docs/VERIFICATION-REPORT.md` | v1 sign-off report |
| `backend/data/series.seed.json` | The 25 series metadata |
| `backend/data/calendar.json` | Hardcoded release fallback |
| `README.md` | Quickstart |

---

## 13. v1.1 / v2 known limitations

- No auth (single-user assumption)
- No CSV / Excel export
- No alerts on release
- Mobile responsive not tuned (desktop-first)
- Observations endpoint not cached → ~700ms for ~10k-row series (acceptable v1)
- BCB official calendar scraper falls back to hardcoded when their SharePoint blocks UA

---

**Daily start:** `make up` → wait healthy → http://localhost:5174
**Daily stop:** `make down`
