<p align="left">
  <img src="docs/assets/pulse-icon.svg" alt="Pulse" width="96" height="32" />
</p>

# Pulse — economic indicators workspace

A personal workspace for tracking **72 Brazilian and international economic indicators** in one place. Pulls live data from official sources (BCB, IBGE, ANBIMA, B3, Yahoo Finance), stores time series locally with full revision history, computes statistical transforms on demand, and renders everything in a pt-BR React dashboard.

Built as a single-user local app — no cloud bill, no account, no telemetry.

---

## What it does

- **Daily auto-extraction** of 54 daily/event-frequency series (interest rates, FX, equity indexes, fixed-income, international markets) every Mon–Fri at 18:00 BRT
- **Monthly/quarterly polling** for inflation, GDP, employment, fiscal, external accounts
- **17 statistical transforms** on demand: MoM, QoQ, YoY, annualized, log-diff, moving averages, EWMA, accumulated 12m, z-score, rebase=100, percentile
- **Animated charts** (line / bar / area) per series with PNG + CSV export
- **Release calendar** of upcoming economic indicator releases (scraped from IBGE + BCB + hardcoded fallback)
- **Personal dashboard**: pin favorite series, save per-card transforms, see recent + sync status

---

## Quickstart (5 commands)

```bash
git clone https://github.com/<you>/api-extractor.git
cd api-extractor
cp .env.example .env
make up                                              # boot stack
make migrate && make seed                            # schema + 72 series
curl -X POST http://localhost:8000/admin/backfill    # ~3-5 min full history
open http://localhost:5174                           # done
```

Requirements: **Docker + Docker Compose v2**. Nothing else. All Python/Node toolchains run inside containers.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vite + React 18 + TypeScript |
| Backend | FastAPI + Pydantic v2 + SQLAlchemy 2.x async |
| Database | Postgres 16 + TimescaleDB (time-series hypertable) |
| Cache | Redis 7 (transform results) |
| Scheduler | APScheduler (3 cron jobs, persisted in Postgres) |
| Transforms | pandas + numpy |
| Deploy | Docker Compose, 4 services, local single-user |

---

## Project map

```
api-extractor/
├── README.md                ← this file
├── docker-compose.yml       ← 4-service stack
├── Makefile                 ← `make up | down | test | seed | migrate`
├── .env.example             ← env contract
├── LICENSE                  ← MIT
├── SECURITY.md              ← responsible disclosure policy
│
├── backend/                 ← FastAPI app
│   ├── pyproject.toml
│   ├── Dockerfile           ← multi-stage
│   ├── alembic/             ← migrations 0001..0004
│   ├── data/
│   │   ├── series.seed.json ← 72 series metadata
│   │   └── calendar.json    ← release calendar hardcoded fallback
│   ├── src/api_extractor/
│   │   ├── main.py          ← FastAPI app + lifespan
│   │   ├── config.py
│   │   ├── db.py
│   │   ├── models/          ← SQLAlchemy: series, observation, revision, release, user_prefs
│   │   ├── schemas/         ← Pydantic request/response
│   │   ├── repos/           ← async data access
│   │   ├── services/        ← extraction, backfill, transforms
│   │   ├── routers/         ← /series /transform /releases /user_prefs /admin /health
│   │   ├── extractors/      ← 5 adapters (BCB, IBGE, B3 portal, Yahoo, ANBIMA bulk)
│   │   ├── transforms/      ← 17 ops + Redis cache
│   │   ├── calendar_scraper/← IBGE + BCB scrape + hardcoded fallback
│   │   ├── scheduler.py     ← APScheduler
│   │   ├── jobs.py          ← daily_batch / periodic_batch / calendar_refresh
│   │   └── scripts/         ← one-shot tools (backfill)
│   └── tests/               ← 293 pytest tests + fixtures per source
│
├── frontend/                ← Vite app
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── pages/           ← Painel · Indices · Calendario · Metadados
│       ├── components/      ← Sidebar, Card, SmallMultiple, AnalysisPanel,
│       │                     Chart, TransformModal, DailyRow, DailyTable,
│       │                     DayDetailModal, Sparkline, DeltaBadge, ...
│       ├── hooks/           ← TanStack Query wrappers
│       ├── lib/             ← formatPtBR, categoryColor, deltaSemantics
│       ├── stores/          ← Zustand UI state
│       ├── styles/          ← design tokens (doc §8 palette)
│       └── api/             ← schema.ts (openapi-typescript codegen)
│
├── docs/
│   ├── PLAN.md              ← phased build log (waves 0–7 + phases 11–21)
│   ├── USER-GUIDE.md        ← operational manual
│   ├── architecture/        ← system design + diagrams
│   ├── adr/                 ← 8 ADRs
│   ├── data-sources/        ← per-source API contracts
│   ├── phase-plans/         ← per-wave plan artifacts
│   ├── VERIFICATION-REPORT.md
│   └── SECURITY-AUDIT-PREGITHUB.md
│
├── specs/
│   └── api-extractor.spec.md ← EARS spec + acceptance criteria
│
├── infra/
│   └── postgres/init.sql    ← timescaledb extension bootstrap
│
└── .github/
    ├── workflows/           ← CI + docker-publish + readme
    ├── ISSUE_TEMPLATE/      ← bug + feature templates pt-BR/en
    ├── PULL_REQUEST_TEMPLATE.md
    ├── CODEOWNERS
    ├── SECURITY.md
    └── dependabot.yml
```

---

## Series catalog (72)

Series are clustered by **theme** and within each theme sorted by **source**.

### 🟡 Inflação — 5 series

| Source | Code | Frequency |
|---|---|---|
| BCB SGS | IGP-DI | monthly |
| BCB SGS | IGP-M | monthly |
| BCB SGS | INPC | monthly |
| BCB SGS | IPCA | monthly |
| BCB SGS | IPCA-15 | monthly |

### 💰 Juros — 4 series

| Source | Code | Frequency |
|---|---|---|
| BCB SGS | CDI | daily |
| BCB SGS | SELIC | daily |
| BCB SGS | SELIC_meta | event |
| BCB SGS | TR | daily |

### 💱 Câmbio — 2 series

| Source | Code | Frequency |
|---|---|---|
| BCB SGS | PTAX_EUR | daily |
| BCB SGS | PTAX_USD | daily |

### 📈 Atividade — 5 series

| Source | Code | Frequency |
|---|---|---|
| BCB SGS | IBC-Br | monthly |
| IBGE SIDRA | PIB_Nominal | quarterly |
| IBGE SIDRA | PIB_Real | quarterly |
| IBGE SIDRA | Prod_Industrial | monthly |
| IBGE SIDRA | Vendas_Varejo | monthly |

### 👷 Trabalho — 3 series

| Source | Code | Frequency |
|---|---|---|
| BCB SGS | CAGED | monthly |
| IBGE SIDRA | Desemprego | quarterly |
| IBGE SIDRA | Rendimento_Medio | quarterly |

### 🏛️ Fiscal — 2 series

| Source | Code | Frequency |
|---|---|---|
| BCB SGS | Divida_Bruta | monthly |
| BCB SGS | Resultado_Primario | monthly |

### 🌍 Externo — 3 series

| Source | Code | Frequency |
|---|---|---|
| BCB SGS | Balanca_Comercial | monthly |
| BCB SGS | Conta_Corrente | monthly |
| BCB SGS | Reservas_Internacionais | monthly |

### 📊 Mercado (Brasil) — 4 series

| Source | Code | Frequency |
|---|---|---|
| B3 portal | IBrX_50 | daily |
| B3 portal | IBrX_100 | daily |
| Yahoo Finance | Ibovespa (^BVSP) | daily |
| Yahoo Finance | IFIX (XFIX11.SA proxy) | daily |

### 🌐 Mercado Internacional — 7 series

| Source | Code | Frequency |
|---|---|---|
| Yahoo Finance | DJIA (^DJI, USD) | daily |
| Yahoo Finance | Euro_Stoxx_50 (^STOXX50E, EUR) | daily |
| Yahoo Finance | MSCI_EM (EEM proxy, USD) | daily |
| Yahoo Finance | MSCI_World (URTH proxy, USD) | daily |
| Yahoo Finance | Nasdaq_100 (^NDX, USD) | daily |
| Yahoo Finance | Nasdaq_Composite (^IXIC, USD) | daily |
| Yahoo Finance | SP500 (^GSPC, USD) | daily |

### 🏦 Governança — 4 series

| Source | Code | Frequency |
|---|---|---|
| B3 portal | IGCT_B3 | daily |
| B3 portal | IGC_B3 | daily |
| B3 portal | IGC_NM_B3 | daily |
| B3 portal | ITAG_B3 | daily |

### 🌿 Sustentabilidade — 3 series

| Source | Code | Frequency |
|---|---|---|
| B3 portal | ICO2_B3 | daily |
| B3 portal | ISE_B3 | daily |
| Yahoo Finance | SP500_ESG (^SPESG, USD) | daily |

### 💼 Multimercado — 1 series

| Source | Code | Frequency |
|---|---|---|
| ANBIMA | IHFA (Hedge Funds) | daily |

### 🧾 Renda Fixa (ANBIMA) — 29 series

All daily, source = ANBIMA (bulk XLSX from `data.anbima.com.br`).

| Family | Codes |
|---|---|
| **IMA** | IMA-Geral · IMA-Geral_ex-C · IMA-S |
| **IMA-B** (IPCA-linked) | IMA-B · IMA-B_5 · IMA-B_5plus · IMA-B_5_P2 |
| **IRF-M** (prefixed) | IRF-M · IRF-M_1 · IRF-M_1plus · IRF-M_P2 · IRF-M_P3 |
| **IDA** (debêntures) | IDA_Geral · IDA_DI · IDA_IPCA · IDA_IPCA_Infra · IDA_IPCA_ExInfra · IDA_Liq_Geral · IDA_Liq_DI · IDA_Liq_IPCA · IDA_Liq_IPCA_Infra |
| **IDKA** (constant duration) | IDKA_PRE_3M · IDKA_PRE_1A · IDKA_PRE_2A · IDKA_PRE_3A · IDKA_PRE_5A · IDKA_IPCA_2A · IDKA_IPCA_3A · IDKA_IPCA_5A |

### Source totals

| Source | # series | Notes |
|---|---|---|
| **ANBIMA** | 30 | Bulk XLSX from S3 (`data.anbima.com.br`) — full history per file |
| **BCB SGS** | 24 | Per-date JSON, 10-year window cap → chunked |
| **Yahoo Finance** | 10 | yfinance 1.3.0; ETF proxies for IFIX, MSCI_World, MSCI_EM |
| **B3 portal** | 8 | `sistemaswebb3-listados.b3.com.br` JSON proxy (no auth) |
| **IBGE SIDRA** | 5 | Variable + classification map (`IBGE_VARIABLE_MAP`) |
| **Total** | **72** | 4 migrations · 12 categories |

Detailed per-source contracts in `docs/data-sources/`.

---

## How to extend

1. **Add a new series**:
   - Append entry to `backend/data/series.seed.json` with `code`, `name`, `category`, `source`, `source_id`, `frequency`, `unit`, `currency`, `is_proxy`, `first_observation`
   - If source = "IBGE SIDRA": also add to `IBGE_VARIABLE_MAP` in `backend/src/api_extractor/extractors/ibge_sidra.py`
   - Run `make seed` then `curl -X POST http://localhost:8000/admin/extract/{code}`

2. **Add a new source**:
   - Subclass `SourceAdapter` in `backend/src/api_extractor/extractors/base.py`
   - Register in `backend/src/api_extractor/extractors/registry.py` (`_SOURCE_SLUG_MAP` + `_ADAPTERS`)
   - Write `docs/data-sources/{slug}.md` documenting endpoint + auth + response shape
   - Add tests + fixture

3. **Add a new transform**:
   - Add function to `backend/src/api_extractor/transforms/ops.py`
   - Register in `transforms/registry.py` `TRANSFORMS` dict
   - Update `TransformSpec.op` Literal in `transforms/spec.py`
   - Add radio in `frontend/src/components/TransformModal/`
   - Add unit test in `backend/tests/test_transforms.py`

---

## Make targets

```
make up           # start all 4 containers
make down         # stop (volumes preserved)
make logs         # stream all logs (service=api for one)
make migrate      # alembic upgrade head
make seed         # load 72 series metadata
make test         # backend pytest suite
make lint         # ruff check
make fmt          # black format
make typecheck    # mypy
make ci-local     # replicate CI checks locally
make secrets-scan # gitleaks against working tree
make shell-api    # bash in api container
make shell-db     # psql in postgres
```

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/series` | List all 72 + status |
| GET | `/series/{code}` | Single series metadata |
| GET | `/series/{code}/observations?from=&to=&limit=` | Raw observations |
| POST | `/series/{code}/transform` | Apply transform spec |
| GET | `/releases?month=YYYY-MM&category=` | Calendar events |
| GET/PATCH | `/user_prefs` | Pins + transforms + recents |
| POST | `/admin/extract/{code}` | Manual extract one |
| POST | `/admin/backfill` | Manual backfill all |
| POST | `/admin/refresh-calendar` | Refresh release calendar |
| GET/POST | `/admin/scheduler/...` | List + trigger scheduler jobs |
| GET | `/health` | Status + per-series freshness |

Full interactive docs: `http://localhost:8000/docs` (Swagger) · `/redoc` (ReDoc) · `/openapi.json`.

---

## Tests

- **Backend** (pytest): **293 pass / 2 skip** — adapter contracts, transforms, repos, API routes, acceptance criteria
- **Frontend** (vitest): **316 pass / 0 TS errors** — components, hooks, pages, integration

```bash
make test                          # backend
docker compose exec web npm run test
docker compose exec web npm run typecheck
```

CI runs both on every push/PR via `.github/workflows/ci.yml`.

---

## Documentation index

| File | Purpose |
|---|---|
| `docs/USER-GUIDE.md` | Operational manual (services, endpoints, troubleshooting) |
| `docs/PLAN.md` | Full build log: 22 phases, agent matrix, deviation tracking |
| `docs/architecture/system-design.md` | System diagrams + data model |
| `docs/adr/` | 8 architecture decision records |
| `docs/data-sources/` | Per-source API contracts (BCB, IBGE, B3 portal, Yahoo, ANBIMA, calendar) |
| `docs/phase-plans/` | Per-wave plan artifacts (W0..W7 + phases 11–21) |
| `docs/SECURITY-AUDIT-PREGITHUB.md` | Pre-push security findings |
| `specs/api-extractor.spec.md` | EARS specification + acceptance criteria |

---

## License

MIT — see `LICENSE`. Permissive: use freely, modify, redistribute. No warranty.

Brand assets / official names of indices (IPCA, IBOVESPA, IMA, etc) belong to their respective publishers (IBGE, BCB, B3, ANBIMA, S&P, MSCI, FTSE, etc). This project pulls publicly available data via documented endpoints and does not redistribute it independently.

---

## ⚠️ Warning — local single-user deployment only

This project ships **without authentication** and is intentionally scoped to a **local, single-user, trusted-network deployment** (your own laptop, behind your own firewall, on `localhost` ports only).

**Do NOT expose this to the internet as-is.** Specifically:

- `/admin/*` endpoints are unauthenticated and let any caller trigger backfills, refresh the calendar, fire scheduler jobs, and overwrite user prefs.
- Postgres defaults to `postgres / postgres` from `.env.example`. Replace before production.
- Redis is published without auth on `localhost:6379`. Do not bind to public interfaces.
- The FastAPI service listens on `0.0.0.0:8000` inside the container. Map only to `127.0.0.1:8000` if you publish ports.
- CORS allows the dev frontend origin. Tighten or remove for any non-local deploy.

If you want to deploy to a VPS or share with others:

1. Add an auth layer (FastAPI Users / OAuth2 reverse proxy / Cloudflare Access).
2. Strengthen `.env` (rotate Postgres + Redis credentials).
3. Move secrets out of `.env` into a secret manager (Vault, AWS Secrets Manager, Doppler).
4. Bind containers to loopback or place behind a reverse proxy (Caddy, nginx, Traefik) with TLS.
5. Review `docs/SECURITY-AUDIT-PREGITHUB.md` Section E (production-deployment caveats).

For local personal use as intended, none of this matters.

---

Built with care over multiple iterative phases. Issues and PRs welcome — see `.github/ISSUE_TEMPLATE/` to get started.
