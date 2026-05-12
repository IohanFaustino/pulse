# Phase 20b — B3 Indexes Research (READ-ONLY)

**Date:** 2026-05-11
**Owner:** research agent
**Status:** in-progress

## Goal

Investigate how to fetch 9 additional B3 (Brasil, Bolsa, Balcão) indexes for ingestion
into the catalog. Produce per-index verdict (yfinance OK / B3 portal scrape required /
no public free source) and document tickers, URL patterns, fixtures, classification
proposal. **Do NOT modify `series.seed.json`, schema, or production code** in this run.

## Indexes in scope (9)

IBOVESPA is already covered (`^BVSP`) and is explicitly out of scope.

| # | Code | Family | Description |
|---|---|---|---|
| 1 | IBrX | Mercado (parent) | Composite of IBrX 50 + IBrX 100 — likely a label, may not have direct ticker |
| 2 | IBrX 50 | Mercado | 50 most-liquid stocks |
| 3 | IBrX 100 | Mercado | 100 most-liquid stocks |
| 4 | ISE B3 | ESG / Sustentabilidade | Corporate sustainability index |
| 5 | ICO2 B3 | ESG / Sustentabilidade | Carbon-efficient companies |
| 6 | IGC B3 | Governança | Differentiated corporate governance (N1+N2+NM) |
| 7 | IGCT B3 | Governança | Governance + liquidity tradable |
| 8 | IGC NM B3 | Governança | Novo Mercado segment only |
| 9 | ITAG B3 | Governança | Tag-along enhanced rights |

## File ownership boundary

| Path | Action |
|---|---|
| `docs/phase-plans/phase-20b-b3-research.md` | **CREATE** (this file) |
| `docs/data-sources/b3-indexes.md` | **CREATE** |
| `backend/tests/fixtures/b3_indexes/*.json` | **CREATE** (3+ representative fixtures) |
| `series.seed.json` | **DO NOT TOUCH** |
| `api_extractor/**` (code) | **DO NOT TOUCH** |
| `infra/**` schema | **DO NOT TOUCH** |
| `pyproject.toml` (yfinance pin) | **DO NOT TOUCH** (research-only note in docs) |

## Execute checklist

- [ ] WebSearch for IBrX Yahoo tickers + B3 sistemaswebb3-listados endpoints
- [ ] yfinance live smoke per candidate ticker (inside api container)
- [ ] WebFetch B3 portal `indexProxy` for at least one ESG/governance index
- [ ] Save 3 representative fixtures (`IBX50`, `ISE`, `IGC`-like)
- [ ] Per-index verdict table (yfinance | b3-portal | none)
- [ ] Classification proposal (category / unit / first_obs)
- [ ] Open questions list

## Test gates

- Each "yfinance" verdict must show ≥ 5 trading days returned live.
- Each fixture must be valid JSON loadable by `json.loads`.
- Doc must list at least one verified ticker (or document that none works).

## Constraints

- Decimal precision (use `Decimal(str(close))` pattern when modeling later)
- Document yfinance compatibility: validated against `yfinance==1.3.0` (project bump noted in `b3-yahoo.md`)
- No invented tickers — empty / "possibly delisted" results must be honestly flagged
- pt-BR strings in user-facing copy
