# Phase 20 — Wave B-3: International Indexes (Yahoo Finance reuse)

## Goal

Verify the existing `B3YahooAdapter` (yfinance-based) works for the 8 new
international index series seeded in Wave A and add regression tests covering
non-Brazilian tickers, currencies, and timezones.

Series in scope (all `source: "Yahoo Finance"`):

| code              | source_id   | currency | market tz           | proxy |
| ----------------- | ----------- | -------- | ------------------- | ----- |
| SP500             | `^GSPC`     | USD      | America/New_York    | no    |
| DJIA              | `^DJI`      | USD      | America/New_York    | no    |
| Nasdaq_Composite  | `^IXIC`     | USD      | America/New_York    | no    |
| Nasdaq_100        | `^NDX`      | USD      | America/New_York    | no    |
| MSCI_World        | `URTH`      | USD      | America/New_York    | yes   |
| MSCI_EM           | `EEM`       | USD      | America/New_York    | yes   |
| Euro_Stoxx_50     | `^STOXX50E` | EUR      | Europe/Berlin       | no    |
| SP500_ESG         | `^SPESG`    | USD      | America/New_York    | no    |

## File ownership

This wave **owns**:

- `backend/src/api_extractor/extractors/b3_yahoo.py` (minimal edit if any)
- `backend/tests/test_extractor_intl.py` (new)
- `docs/data-sources/intl-indexes.md` (append implementation notes)
- `docs/phase-plans/phase-20-wave-b3-intl.md` (this file)

**Does NOT touch**: `anbima_ima.py`, `b3_portal.py`, `registry.py`,
`series.seed.json`, schema/migrations, frontend.

## Adapter generality check

`B3YahooAdapter.fetch` is series-driven: it reads `symbol = series.source_id`
and passes it verbatim to `yfinance.Ticker`. No B3-specific branches. The
only place where Brazil-specific knowledge lives is `_to_utc_midnight`, which
converts tz-aware timestamps to `America/Sao_Paulo` before extracting the
trading-day date.

### Timezone correction needed

The previous Sao_Paulo conversion silently shifts European trading days back by
one calendar day. For a `^STOXX50E` bar stamped `2026-04-13T00:00:00+02:00`,
converting to `America/Sao_Paulo` (UTC-3) yields `2026-04-12T19:00`, anchoring
the observation to **2026-04-12 UTC** — one day off.

**Fix**: when the upstream timestamp is tz-aware, take its date *in its own
timezone* (which is yfinance's anchor convention: midnight of the trading
day, local market tz). For naive timestamps, take the date as-is. Either
way, anchor to UTC midnight of that trading day.

This preserves correctness for Brazil (^BVSP, XFIX11.SA → America/Sao_Paulo
midnight is already on the right date) and fixes Europe/US tickers.

## Test plan (`test_extractor_intl.py`)

Fixture-replay tests, no network:

1. `test_parse_fixture_sp500` — `^GSPC` fixture → ≥15 obs, all Decimal, sorted.
2. `test_parse_fixture_nasdaq_composite` — `^IXIC` fixture → ≥15 obs.
3. `test_parse_fixture_euro_stoxx_trading_day_preserved` —
   `^STOXX50E` fixture (Europe/Berlin tz) → observation dates equal the
   original fixture dates (no off-by-one).
4. `test_currency_metadata_is_series_level` — adapter does not attach a
   currency field to observations (currency lives on `Series` only).
5. `test_proxy_etf_returns_etf_values_not_index` — URTH proxy: ETF prices
   are ~$150-300 range, distinct from MSCI World index magnitude (~3000).

## Live smoke

Three representative series via `POST /admin/extract/{code}?since=2026-04-01`:

- `SP500` (^GSPC, USD, NY) → ≥15 obs
- `Euro_Stoxx_50` (^STOXX50E, EUR, Berlin) → ≥15 obs
- `MSCI_World` (URTH proxy, USD, NY) → ≥15 obs

## Acceptance

- `pytest backend/tests/test_extractor_intl.py -v` green
- Full pytest still green (existing b3_yahoo tests must not regress)
- Three live smokes return ≥15 obs each
