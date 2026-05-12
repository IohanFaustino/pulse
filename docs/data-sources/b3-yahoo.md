# B3 / Yahoo Finance — Data Source Contract

**Library:** [`yfinance`](https://pypi.org/project/yfinance/) (unofficial Yahoo Finance scraper)
**Version pinned in `pyproject.toml`:** `yfinance==0.2.50`
**Version validated live (2026-05-11) and required:** `yfinance>=1.3.0`
**Auth:** none (no API key — Yahoo is unofficial, public)

> **CRITICAL:** `yfinance==0.2.50` (the version currently pinned) FAILS against current
> Yahoo Finance endpoints (`Expecting value: line 1 column 1 (char 0)` / `possibly
> delisted`). The pin must be bumped to `>=1.3.0`. Filed as open question for orchestrator.

---

## 1. Symbol mapping (Brazilian assets)

| Series code | Yahoo ticker | Notes |
|---|---|---|
| `Ibovespa` | `^BVSP` | Native Yahoo index. Daily OHLCV history. |
| `IFIX` | `XFIX11.SA` (**proxy, see below**) | Real IFIX index has no Yahoo coverage. |

### IFIX ticker resolution (researched 2026-05-11)

Tested candidates against `yfinance==1.3.0`:

| Candidate | Result |
|---|---|
| `^IFIX` | 404 — `Quote not found for symbol: ^IFIX` |
| `IFIX.SA` | 1 row, all zeros — no real history |
| `IFIX11.SA` | 404 — `Quote not found` |
| `IFIX` | empty — possibly delisted |
| `XFIX11.SA` | 251 trading days in 1y — real OHLCV (XP Malls FII ETF tracking IFIX) |

**Decision:** use `XFIX11.SA` as practical proxy. It is the **Xtrackers IFIX ETF** —
not the IFIX index itself but the closest tradable instrument with full daily history
on Yahoo. Magnitudes differ (ETF ~R$13.83 vs IFIX index ~3500 pts) — `unit` in
`series.seed.json` should be updated from `pts` to `R$/quota` if XFIX11 is adopted.

**Future work:** for true IFIX index values, build a B3 scraper against
`https://sistemaswebb3-listados.b3.com.br/indexProxy/...` (returns JSON portfolio +
daily theoretical totals). Out of scope for Phase 2.

---

## 2. Method

```python
import yfinance as yf
ticker = yf.Ticker(symbol)
df = ticker.history(start=since_date, end=None, interval="1d")  # daily
```

- Returns `pandas.DataFrame` with `DatetimeIndex` and columns:
  `Open, High, Low, Close, Volume, Dividends, Stock Splits` (no `Adj Close` since v0.2).
- Index TZ: `America/Sao_Paulo` (BRT) — must normalize to UTC.
- yfinance is **synchronous** — adapter wraps blocking call via `asyncio.to_thread`.

### For index series

`value = Close` (the daily closing level). Open/High/Low ignored. Volume is
not meaningful for indices (Yahoo reports synthetic numbers).

---

## 3. Date / timezone normalization

Yahoo returns `2026-05-08 00:00:00-03:00` for the 2026-05-08 trading day.
Adapter normalizes by:

1. Take the local date component (`.date()`).
2. Anchor to `datetime(year, month, day, tzinfo=UTC)` — UTC midnight of the
   trading day, per `base.FetchedObservation` contract.

This matches Phase 1's hypertable anchor convention (daily series anchor to
00:00 UTC of trading day).

---

## 4. Response shape (sample)

`backend/tests/fixtures/b3_yahoo/bvsp_30d.json`:

```json
{
  "ticker": "^BVSP",
  "period": "1mo",
  "records": [
    {"Date": "2026-04-08T00:00:00-03:00", "Open": 188261.0, "High": 193759.0,
     "Low": 188260.0, "Close": 192201.0, "Volume": 12594000,
     "Dividends": 0.0, "Stock Splits": 0.0},
    ...
  ]
}
```

---

## 5. Known quirks

| Quirk | Handling |
|---|---|
| Brazilian holidays produce missing rows (no Date) | Adapter forwards what Yahoo returns; downstream `releases` table handles expected dates |
| Splits/dividends columns | Always 0.0 for indices; ignored |
| Weekend gaps | Standard; no rows for Sat/Sun |
| `yfinance` rate limits (unofficial) | tenacity 3x exp backoff (2s, 8s, 30s); recommended ≤5 req/min from one process |
| Yahoo intermittent 404 / empty response | Treated as transient by tenacity; final empty → return empty observations (not error) |
| TZ-naive vs TZ-aware index across versions | Adapter coerces: if naive, assume America/Sao_Paulo then convert |
| Float values from pandas | Convert via `Decimal(str(close))` — never `Decimal(float)` |

---

## 6. Per-series sample calls

### Ibovespa (`^BVSP`)

```python
import yfinance as yf
df = yf.Ticker("^BVSP").history(start="1993-04-27")
df["Close"].tail()
```

### IFIX (`XFIX11.SA`, proxy)

```python
import yfinance as yf
df = yf.Ticker("XFIX11.SA").history(start="2012-01-03")
df["Close"].tail()
```

---

## 7. Per-series summary table

| code | yfinance_ticker | freq | first_observation | unit (suggested) |
|---|---|---|---|---|
| `Ibovespa` | `^BVSP` | daily | 1993-04-27 | pts |
| `IFIX` | `XFIX11.SA` | daily | 2012-01-03 (history may start later) | R$/quota (was: pts) |

---

## 8. Open questions (for orchestrator)

1. **Bump `yfinance` to `>=1.3.0`** in `pyproject.toml`? (Required — 0.2.50 broken.)
2. **Accept `XFIX11.SA` as IFIX proxy** or defer IFIX to a future B3-scraper phase?
   If accepted: update `series.seed.json` `IFIX.source_id` → `XFIX11.SA` and unit.
3. Should `volume` be persisted alongside close for indices? (Currently dropped.)

## Daily series (auto-fetched)

These 2 Yahoo Finance series fire via the `daily_batch` scheduler job every Mon-Fri 18:00 BRT:

| Code | ticker | Description |
|---|---|---|
| Ibovespa | ^BVSP | Índice Bovespa (close) |
| IFIX | XFIX11.SA | IFIX proxy via Xtrackers IFIX ETF (close) |

The Painel page renders these in the "Diariamente" row under the calendar strip.

## Multi-measure roadmap (Phase 18 stage 1 complete)

Planned Ibovespa measures (post-stage-1):
- `close` (default) — yfinance Close column, pontos
- `pct_daily` (derived) — applies `mom` transform to close series at read time
