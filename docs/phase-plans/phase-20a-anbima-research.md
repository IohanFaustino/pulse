# Phase 20a — ANBIMA IMA Research

**Status:** Research-only. No seed.json/backend/frontend mutations in this phase.
**Owner:** Data-sources research track.
**Date:** 2026-05-11.

## Goal

Determine whether the 12 ANBIMA IMA-family indexes can be ingested via a public,
machine-readable endpoint comparable to BCB SGS / IBGE SIDRA, and document the
chosen strategy (REST / CSV download / scrape / manual upload fallback).

## Scope — file ownership boundary

| Path | Action |
|---|---|
| `docs/data-sources/anbima-ima.md` | CREATE |
| `backend/tests/fixtures/anbima_ima/*` | CREATE (raw fixtures only) |
| `docs/phase-plans/phase-20a-anbima-research.md` | CREATE (this file) |

**Forbidden in this phase:** `seed.json`, anything under `backend/src/`, anything
under `frontend/`, schema files, design tokens.

## Indexes in scope (12)

| Code | Title | Underlying basket |
|---|---|---|
| IMA-Geral | IMA-Geral | All federal public bonds (mkt cap weighted) |
| IMA-Geral ex-C | IMA-Geral ex-C | IMA-Geral minus NTN-C |
| IMA-B | IMA-B | NTN-B (IPCA + cupom) |
| IMA-B 5 | IMA-B 5 | NTN-B with maturity ≤ 5y |
| IMA-B 5+ | IMA-B 5+ | NTN-B with maturity > 5y |
| IMA-C | IMA-C | NTN-C (IGP-M + cupom) — closed family, runoff |
| IMA-C 5 | IMA-C 5 | NTN-C ≤ 5y |
| IMA-C 5+ | IMA-C 5+ | NTN-C > 5y |
| IRF-M | IRF-M | LTN + NTN-F (prefixados) |
| IRF-M 1 | IRF-M 1 | Prefixados ≤ 1y |
| IRF-M 1+ | IRF-M 1+ | Prefixados > 1y |
| IMA-S | IMA-S | LFT (SELIC) |

## Execution steps

1. **Web search** ANBIMA portal + Wayback for the IMA results page.
2. **WebFetch** the canonical IMA estatísticas page; identify download links
   (CSV, XLS, JSON).
3. **curl probe** any direct download endpoint (HEAD + GET first ~50 rows).
4. **Save raw fixtures** to `backend/tests/fixtures/anbima_ima/` covering at
   minimum: IMA-Geral, IMA-B, IRF-M (last ~50 obs).
5. **Parse-smoke-test** each fixture (open with Python csv / openpyxl / json).
6. **Write report** at `docs/data-sources/anbima-ima.md` mirroring the structure
   of `bcb-sgs.md` and `ibge-sidra.md`.

## Decision matrix for adapter strategy

| Endpoint type discovered | Recommended adapter |
|---|---|
| Public JSON/CSV REST | New `ANBIMAAdapter` (similar to BCBSGSAdapter) |
| Direct download CSV/XLS, no auth | New `ANBIMAAdapter` w/ openpyxl/csv parsing |
| HTML scrape only | `ANBIMAScrapeAdapter` w/ BeautifulSoup + caching |
| Auth/login required | Document fallback: **manual CSV upload** workflow + scheduler `manual` source |

## Risks / open questions to surface to orchestrator

- Licensing: ANBIMA's terms-of-use historically discourage redistribution of
  reference prices and indexes. We need legal sign-off before exposing IMA via
  our public API.
- "Renda Fixa" is a **new category** in seed.json — needs orchestrator approval.
- "ANBIMA" is a **new source** in our source registry — needs orchestrator approval.
- Backfill depth (some ANBIMA historical files cover 2000-12-29 onward; others
  only last 12 months on the website).

## Test plan

- For each saved fixture: open programmatically and assert ≥ 30 rows parseable.
- Document any encoding or separator quirks.

## Exit criteria

- `docs/data-sources/anbima-ima.md` exists and answers all 11 required sections.
- ≥ 3 raw fixtures saved under `backend/tests/fixtures/anbima_ima/`.
- Open Qs list reviewed by orchestrator before Phase 20b implementation.
