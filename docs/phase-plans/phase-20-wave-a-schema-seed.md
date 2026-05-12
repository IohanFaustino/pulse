# Phase 20 Wave A — Schema Migration + Seed Enrichment

**Date:** 2026-05-11
**Status:** In progress
**Scope:** Schema migration 0004 (currency + is_proxy) + 26 new seed entries. NO adapters.

---

## Goals

- Migration 0004: ADD COLUMN `currency TEXT NOT NULL DEFAULT 'BRL'` and `is_proxy BOOLEAN NOT NULL DEFAULT FALSE` to `series`.
- Update `Series` ORM model with two new `Mapped` attributes.
- Update `SeriesRead` Pydantic schema to expose both new fields.
- Update `seed.py._parse_seed_row` to pass `currency` and `is_proxy` if present.
- Update `series_repo.upsert` — no change needed (already pass-through for any dict key).
- Append 26 new entries to `series.seed.json` (9 ANBIMA, 8 B3 portal, 9 Intl Yahoo).
- Update IFIX entry: add `is_proxy: true`.
- Update tests to assert 51 total series, new categories, and new schema fields.

## File Ownership

| File | Action |
|---|---|
| `backend/alembic/versions/0004_currency_proxy.py` | CREATE |
| `backend/src/api_extractor/models/series.py` | EDIT — add `currency`, `is_proxy` |
| `backend/src/api_extractor/schemas/series.py` | EDIT — add fields to `SeriesRead` + `from_orm_row` |
| `backend/src/api_extractor/seed.py` | EDIT — `_parse_seed_row` handles `is_proxy` bool |
| `backend/data/series.seed.json` | EDIT — append 26 entries, patch IFIX |
| `backend/tests/test_seed.py` | EDIT — 51 total, new categories, new fields |
| `backend/tests/test_migration_hypertable.py` | EDIT — version check → `0004` |
| `backend/tests/test_api_series.py` | EDIT — assert `currency` / `is_proxy` on `SeriesRead` |

## DO NOT TOUCH

- Any extractor files (`extractors/`)
- `backfill_service.py`
- Frontend code
- `schema.ts`

## New Categories

- `Renda Fixa` (9 ANBIMA IMA series)
- `Mercado Internacional` (7 intl index series)
- `Sustentabilidade` (ISE B3, ICO2 B3, S&P 500 ESG)
- `Governança` (4 B3 governance series)

## Seed Count Breakdown

| Group | Count | Final total |
|---|---|---|
| Existing (unchanged) | 25 | — |
| ANBIMA IMA | 9 | — |
| B3 portal | 8 | — |
| Intl Yahoo | 9 | — |
| **Total** | **51** | **51** |

## Dropped (per locked decisions)

- IMA-C family (3 series) — discontinued
- DJSI World — unavailable on Yahoo, no reliable proxy
- FTSE4Good global — unavailable on Yahoo
- IBrX parent — UI grouping label only, not a series

## Open Questions for Wave B

1. ANBIMA public endpoint licensing — can we redistribute IMA values via public API?
2. B3 portal extractor split — `b3_portal.py` separate from `b3_yahoo.py`?
3. IBrX 50: Yahoo `^IBX50` (2012+) vs B3 `IBXL` (1995+) end-to-end for consistency?
4. IMA-C end_observation — when did it last appear in ANBIMA quadro?
5. Currency display in frontend — suffix badge (USD/EUR) vs BRL conversion?
6. MSCI World/EM proxy ETF — accept as definitivo or pursue MSCI API?
7. yfinance pin upgrade from `0.2.50` → `>=1.3.0` (required for intl adapters).
