# B3 Indexes — Data Source Contract

**Status:** research (Phase 20b, 2026-05-11). Implementation deferred.
**Scope:** 9 indexes (IBOVESPA is out of scope — already covered in `b3-yahoo.md`).
**Auth:** none (all sources are public/unofficial).

This document covers the additional B3 indexes researched in Phase 20b. Two source
families are needed because Yahoo Finance only exposes daily history for a single
member of the IBrX family (IBrX 50). The other 8 indexes require scraping the public
B3 portal.

---

## 1. Sources

### 1.A Yahoo Finance (via `yfinance`)

- Library: `yfinance>=1.3.0` (same constraint as `b3-yahoo.md`)
- Method: `yfinance.Ticker(symbol).history(start=..., interval="1d")`
- Returns OHLCV pandas DataFrame, identical contract to existing `^BVSP` adapter
- TZ: `America/Sao_Paulo`; normalize via existing date-anchor convention (UTC midnight of trading day)

Only **IBrX 50** (`^IBX50`) has working daily history on Yahoo. ETF proxies exist for
several others (e.g. `BRAX11.SA` for IBrX 100, `ISUS11.SA` for ISE) but tracking error
and unit mismatch (R$/quota vs pontos) make them inferior to the B3 portal feed.

### 1.B B3 Portal — `indexStatisticsProxy`

- Base URL: `https://sistemaswebb3-listados.b3.com.br/indexStatisticsProxy/IndexCall/`
- Method: HTTPS GET, no auth, no API key
- Path parameter: a **base64-encoded JSON** payload
- Returns JSON
- Validated against indexes: `IBOV`, `IBXX` (IBrX 100), `IBXL` (IBrX 50),
  `IGCX`, `IGCT`, `IGNM`, `ITAG`, `ICO2`, `ISEE`
- TLS: certificate chain unreliable from some CI environments → recommend
  `verify=True` first, fall back to `verify=False` with warning logged (mirrors
  `rb3`'s `verifyssl: false`).

#### Endpoint: `GetPortfolioDay` (historical year matrix)

> Note: `GetPortfolioDay` lives under **two different proxies** with different
> semantics. The path matters.
> - `indexProxy/indexCall/GetPortfolioDay/...` → returns the current portfolio
>   *composition* (constituent stocks). Not useful for value series.
> - `indexStatisticsProxy/IndexCall/GetPortfolioDay/...` → returns the historical
>   daily-index-level matrix for the requested year. **This is the one we want.**

URL template:
```
https://sistemaswebb3-listados.b3.com.br/indexStatisticsProxy/IndexCall/GetPortfolioDay/{base64_payload}
```

Payload (JSON, then base64-encoded):
```json
{"language": "pt-br", "index": "ISEE", "year": "2025"}
```

Response shape (truncated):
```json
{
  "min": {"day": 0, "rateValue1": "118.532,68", ..., "rateValue12": "157.327,26"},
  "max": {"day": 0, "rateValue1": "126.912,78", ..., "rateValue12": "164.455,61"},
  "results": [
    {"day": 1, "rateValue1": null, "rateValue2": null, "rateValue3": null,
     "rateValue4": "131.147,29", "rateValue5": null, "rateValue6": null,
     "rateValue7": "139.549,43", "rateValue8": "132.437,39", "rateValue9": "141.283,01",
     "rateValue10": "145.517,35", "rateValue11": null, "rateValue12": "158.611,01"},
    {"day": 2, ...},
    ...
    {"day": 31, ...}
  ]
}
```

Schema interpretation:
- `results` is always 31 rows (day-of-month 1..31), independent of month length
- `rateValueN` = index closing level on day `d=row.day` of month `N` (1=jan..12=dec)
- `null` means: no trading that day (weekend/holiday) **OR** day-of-month does not
  exist in that month (e.g. Feb 30) **OR** before/after history coverage
- Values are pt-BR formatted: `"131.147,29"` → thousands separator `.`, decimal `,`
- `min`/`max` rows give the year's monthly min/max (use `day: 0` to detect them)

#### Parsing rule (Python pseudocode)

```python
from decimal import Decimal
from datetime import date, datetime, timezone

def parse_b3_year(year: int, results: list[dict]) -> list[tuple[date, Decimal]]:
    out = []
    for row in results:
        d = row["day"]
        for m in range(1, 13):
            v = row.get(f"rateValue{m}")
            if v is None:
                continue
            try:
                anchor = date(year, m, d)
            except ValueError:
                continue  # day 30 of Feb, day 31 of Apr, etc.
            # pt-BR -> Decimal-safe
            decimal_v = Decimal(v.replace(".", "").replace(",", "."))
            out.append((anchor, decimal_v))
    return sorted(out)
```

UTC anchor: same convention as existing extractors —
`datetime(year, m, d, tzinfo=timezone.utc)` (UTC midnight of trading day).

---

## 2. Per-index ticker mapping (verified 2026-05-11)

Smoke run via `docker compose exec api python -c "import yfinance as yf; ..."` and
direct curl against the B3 portal. **Yahoo "1 row" = quote snapshot only, NO historical
series** — treated here as `EMPTY` for the purpose of backfill.

| Index | Yahoo ticker(s) tried | Yahoo verdict | B3 portal code | Recommended source |
|---|---|---|---|---|
| **IBrX (parent)** | `^IBX`, `IBX.SA`, `^IBOV` | EMPTY (none) | — (no native code; conceptual umbrella) | Treat as **label only**, do not ingest. Derive from IBrX 50 + IBrX 100. |
| **IBrX 50** | `^IBX50` ✅ 3 319 rows from 2012-12-13 | **OK** | `IBXL` | **Yahoo `^IBX50`** (preferred). Fallback: B3 `IBXL` for pre-2012 history. |
| **IBrX 100** | `^IBX100`, `IBX100.SA`, `^IBXX` | EMPTY | `IBXX` | **B3 `IBXX`** (Yahoo has no ticker). |
| **ISE B3** | `^ISEE`, `ISE.SA` empty; `ISUS11.SA` is ETF (44.95 R$) | EMPTY (index); ETF only | `ISEE` | **B3 `ISEE`** (true index in pts). |
| **ICO2 B3** | `^ICO2` empty; `ICO2.SA` quote-only | EMPTY (history) | `ICO2` | **B3 `ICO2`**. |
| **IGC B3** | `^IGCX` quote-only; `IGC.SA`, `IGCX11.SA` empty | EMPTY (history) | `IGCX` | **B3 `IGCX`**. |
| **IGCT B3** | `^IGCT` empty; `IGCT.SA` quote-only | EMPTY (history) | `IGCT` | **B3 `IGCT`**. |
| **IGC NM B3** | `^IGNM` empty; `IGNM.SA` quote-only | EMPTY (history) | `IGNM` | **B3 `IGNM`**. |
| **ITAG B3** | `^ITAG` empty; `ITAG.SA` quote-only | EMPTY (history) | `ITAG` | **B3 `ITAG`**. |

### ETF proxies considered and rejected

| Index | Candidate ETF | Why rejected |
|---|---|---|
| IBrX 100 | `BRAX11.SA` (iShares IBrX 100) | Unit mismatch (R$/quota vs pts); tracking error 0.3–0.6 %; not the index. |
| IBrX 50 | `PIBB11.SA` (Itaú PIBB IBrX 50) | Same; `^IBX50` already gives clean index level. |
| ISE | `ISUS11.SA` | Same unit mismatch; B3 portal returns the real index. |
| Ibovespa | `BOVA11.SA` | Out of scope (Ibov uses `^BVSP`). |

ETFs may eventually be useful as their own series (e.g. for total-return) but should
NOT alias an index code in `series.seed.json`.

---

## 3. Sample calls

### 3.A Yahoo (IBrX 50)

```python
import yfinance as yf
df = yf.Ticker("^IBX50").history(start="2012-12-13", interval="1d")
df["Close"].tail()
```

curl-equivalent (Yahoo chart endpoint, illustrative — `yfinance` handles cookies/crumb):
```bash
curl -s "https://query1.finance.yahoo.com/v8/finance/chart/%5EIBX50?range=1mo&interval=1d" \
  -H "User-Agent: Mozilla/5.0"
```

### 3.B B3 portal (e.g. ISE 2025)

```bash
PAYLOAD=$(printf '{"language":"pt-br","index":"ISEE","year":"2025"}' | base64 -w0)
curl -s "https://sistemaswebb3-listados.b3.com.br/indexStatisticsProxy/IndexCall/GetPortfolioDay/${PAYLOAD}" \
  -H "User-Agent: Mozilla/5.0" | jq '.results[0]'
```

```python
import base64, json, requests
def b3_index_year(code: str, year: int) -> dict:
    payload = base64.b64encode(
        json.dumps({"language":"pt-br","index":code,"year":str(year)}).encode()
    ).decode()
    url = f"https://sistemaswebb3-listados.b3.com.br/indexStatisticsProxy/IndexCall/GetPortfolioDay/{payload}"
    r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=20)
    r.raise_for_status()
    return r.json()
```

Backfill loop: iterate `year` from `first_observation.year` to `today.year`, parse
each response into `(date, value)` tuples, dedupe, then upsert.

---

## 4. Update routine

- B3 publishes the **closing index** value within minutes of market close
  (B3 cash session: **10:00–17:00 BRT** Mon–Fri; sometimes 17:55 after-hours).
- The `indexStatisticsProxy` matrix for the current year is updated daily and includes
  the day's close in `rateValue{month}` for `day == today.day`.
- Recommended cron: existing **`daily_batch` job at 18:00 BRT** (same as `^BVSP`). Pull
  only the current year's matrix; recompute the new (date, value) tuples; upsert.
- For historical backfill (first ingestion of a series): iterate years and rate-limit
  ≤ 5 req/s. Total payload per index is ~25 years × ~15 KB ≈ 400 KB.

---

## 5. First-observation per index (probed live)

| Index | Source code | first_observation | Probe evidence |
|---|---|---|---|
| IBrX 50 | `^IBX50` (Yahoo) | **2012-12-13** | `yf.Ticker("^IBX50").history(period="max")` → 3 319 rows starting 2012-12-13 |
| IBrX 50 | `IBXL` (B3) | **circa 2003** | `IBXL` year 2003 → 250 non-null cells (full year) |
| IBrX 100 | `IBXX` (B3) | **1995** | year 1995 returns 245 non-null cells (active) |
| ISE B3 | `ISEE` (B3) | **2005-12** | year 2005 → only 22 non-null cells (last weeks); year 2006 full |
| ICO2 B3 | `ICO2` (B3) | **2010-12** | year 2010 → 83 non-null cells (partial); year 2011 full |
| IGC B3 | `IGCX` (B3) | **2001-06** (mid-year start) | year 2001 → 128 non-null cells (~half year); year 2002 full |
| IGCT B3 | `IGCT` (B3) | **2011** | year 2010 → 247 cells; year 2011 → 249 |
| IGC NM B3 | `IGNM` (B3) | **2011** | year 2010 → 247 cells (likely launched late 2010); year 2011 full |
| ITAG B3 | `ITAG` (B3) | **2003** | year 2003 → 250 non-null cells (full year) |

Implementation should refine these by inspecting the first non-null `rateValue` in the
earliest non-empty year (left as a TODO for the extractor).

---

## 6. Known quirks

| Quirk | Handling |
|---|---|
| pt-BR numeric format (`131.147,29`) | strip `.`, replace `,`→`.`, parse via `Decimal(str(...))` |
| `rateValueN` null = no-trade vs out-of-month | both produce `None`; downstream code MUST guard against `date(2025, 2, 30)` raising `ValueError` |
| Base64 padding | always include `=` padding (`base64.b64encode` does this by default) |
| `User-Agent` required | B3 responds 403 to default Python UA; set to `Mozilla/5.0` |
| TLS chain | `rb3` uses `verifyssl: false`; we should attempt verification first |
| 31-row matrix is dense regardless of year | even Feb has rows day=29/30/31 with all nulls — skip silently |
| `min`/`max` envelope | NOT historical points; `day == 0` identifies them — ignore in parser |
| IBrX is a **family label**, not an index with values | do NOT ingest a series for code `IBrX` — present it as a UI grouping that contains `IBrX 50` and `IBrX 100` |
| `^IBX50` Yahoo history starts only 2012-12-13 | for older history (2003–2012) use B3 `IBXL` and merge |
| ETF proxies are R$/quota, indexes are pts | never alias the two in one series |

---

## 7. Classification proposal (does NOT touch `series.seed.json`)

Recommended seed entries (for the orchestrator agent to write later):

| code | source_id | source | freq | unit | category | first_observation | notes |
|---|---|---|---|---|---|---|---|
| `IBrX50` | `^IBX50` | Yahoo Finance | daily | pontos | Mercado | 2012-12-13 | uses yfinance path; falls back to B3 `IBXL` for pre-2012 |
| `IBrX100` | `IBXX` | B3 | daily | pontos | Mercado | 1995-01-02 | new B3-portal extractor required |
| `ISE` | `ISEE` | B3 | daily | pontos | **Sustentabilidade** (new) | 2005-12-01 | category proposed (alt: "ESG") |
| `ICO2` | `ICO2` | B3 | daily | pontos | **Sustentabilidade** (new) | 2010-12-01 | low-carbon emissions theme |
| `IGC` | `IGCX` | B3 | daily | pontos | **Governança** (new) | 2001-06-26 | parent governance index |
| `IGCT` | `IGCT` | B3 | daily | pontos | **Governança** (new) | 2011-01-03 | governance + liquidity |
| `IGCNM` | `IGNM` | B3 | daily | pontos | **Governança** (new) | 2011-01-03 | Novo Mercado segment |
| `ITAG` | `ITAG` | B3 | daily | pontos | **Governança** (new) | 2003-08-15 | tag-along rights |

For **IBrX (parent)**: do **not** add a series. Instead expose it as a frontend grouping
label that aggregates `IBrX50` + `IBrX100`. (Open question for orchestrator.)

pt-BR `display_name` suggestions:
- IBrX 50 → "IBrX 50"
- IBrX 100 → "IBrX 100"
- ISE → "ISE B3 – Sustentabilidade Empresarial"
- ICO2 → "ICO2 B3 – Carbono Eficiente"
- IGC → "IGC B3 – Governança Corporativa"
- IGCT → "IGCT B3 – Governança + Liquidez"
- IGCNM → "IGC NM B3 – Novo Mercado"
- ITAG → "ITAG B3 – Tag Along"

---

## 8. Fixtures saved

Path: `backend/tests/fixtures/b3_indexes/`

| File | Source | What it captures |
|---|---|---|
| `ibx50_yfinance_30d.json` | Yahoo `^IBX50` | 19-row OHLCV slice (last 1mo), shape compatible with existing `b3_yahoo` adapter |
| `isee_b3portal_2025.json` | B3 `ISEE` 2025 | full year matrix (31 day-rows × 12 month-cols), pt-BR formatted |
| `igcx_b3portal_2025.json` | B3 `IGCX` 2025 | same shape, distinct numeric magnitudes |
| `ico2_b3portal_2025.json` | B3 `ICO2` 2025 | same shape; used to verify ESG-family parity |

Each fixture passes `json.load()` and includes the source URL/parameters used.

---

## 8b. Implementation notes (Wave B-2, 2026-05-11)

The B3-portal extractor lives at
`backend/src/api_extractor/extractors/b3_portal.py` (class `B3PortalAdapter`,
`source = "b3_portal"`). It is registered under display name `"B3"` and slug
`"b3_portal"` in `backend/src/api_extractor/extractors/registry.py`. The
`"b3"` slug was repointed from the Yahoo adapter to the portal adapter so the
8 seeded B3-portal series (`IBrX_50`, `IBrX_100`, `ISE_B3`, `ICO2_B3`,
`IGC_B3`, `IGCT_B3`, `IGC_NM_B3`, `ITAG_B3`, all with `source="B3"`) resolve
correctly. Ibovespa and IFIX continue to resolve via `"Yahoo Finance"`.

Endpoint variant used: the **year-matrix** payload validated by the captured
fixtures —
`{"language":"pt-br","index":"<CODE>","year":"<YYYY>"}` — base64-encoded into
the URL path. The brief originally mentioned a per-month `monthYear`
(`MM/YYYY`) variant; we did not adopt it because the year variant already
returns a full 31×12 matrix in one request, so monthly iteration would
multiply requests 12× for no extra data. If B3 deprecates the year variant
the existing `_parse_year_matrix` helper can be reused against a one-month
slice with minimal change.

Key behaviors:

- `httpx.AsyncClient` with `User-Agent: Mozilla/5.0` (B3 returns 403 to default
  Python UA).
- `tenacity` retry, 3× exponential backoff (2s / 8s / 30s), retrying only
  transport errors and HTTP 5xx / 429.
- Polite `asyncio.sleep(0.5)` between consecutive year requests (configurable
  via `inter_year_sleep_s` to allow tests to disable it).
- `_parse_pt_br_decimal` strips thousands `.`, swaps `,` → `.`, parses to
  `Decimal` (never via `float`).
- `_parse_year_matrix` skips: `day == 0` envelope rows, `None` cells, and
  invalid calendar dates (Feb 30, Apr 31, etc.) caught from `date(year, m, d)`.
- Observations anchored to `datetime(year, month, day, tzinfo=UTC)`.
- Year range iterated `[max(since, series.first_observation).year, today.year]`
  inclusive; results filtered to `>= since` and sorted ascending; defensive
  dedupe on `observed_at`.

Tests live at `backend/tests/test_extractor_b3_portal.py` and use
`httpx.MockTransport` so no live network is touched.

---

## 9. Open questions for orchestrator

1. **Category taxonomy** — confirm new categories `Sustentabilidade` and `Governança`
   (or fold both into existing `ESG` if one already exists). Current `Mercado` covers
   the IBrX family.
2. **IBrX (parent)** — model as a UI grouping label only, or also as a synthetic
   weighted series? Recommendation: UI label only (the math would be ambiguous).
3. **Extractor split** — add a new `b3_portal.py` extractor (separate from
   `b3_yahoo.py`) with shared base class, since the response shape and auth path
   differ substantially.
4. **IBrX 50 source choice** — Yahoo `^IBX50` works cleanly from 2012-12-13. Use
   Yahoo for live + B3 `IBXL` for pre-2012 backfill? Or B3 `IBXL` end-to-end for
   consistency with the other 7 indexes? Recommendation: B3-only for the family
   (single code path).
5. **Daily update window** — confirm 18:00 BRT cron is sufficient; B3 sometimes
   publishes the closing matrix late on volatile days.
6. **License / terms-of-use** — B3 portal endpoints are public but unofficial. The
   `rb3` ROpenSci package treats them as scraping. Risk acceptance is the same as
   `yfinance` for Yahoo: best-effort, no SLA.
7. **`yfinance` pin** — same constraint already documented in `b3-yahoo.md`:
   `>=1.3.0` required (current pin `0.2.50` is broken).
8. **Decimal precision** — B3 values arrive with 2 decimal places (`131.147,29`).
   Schema currently uses `Numeric(20, 6)` for `observations.value`; keep as is to
   leave room for derived measures.
