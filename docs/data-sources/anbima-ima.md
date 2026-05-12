# ANBIMA — Família IMA (Índice de Mercado ANBIMA)

**Owner (proposed):** Phase 20b ANBIMA adapter (`backend/src/api_extractor/extractors/anbima_ima.py` — NOT YET CREATED).
**Last verified:** 2026-05-11 against the public ANBIMA "série histórica" download endpoint.
**Status:** Research-only. seed.json / backend code unchanged in this phase.

## 1. Official source

ANBIMA — Associação Brasileira das Entidades dos Mercados Financeiro e de
Capitais — is the sole calculator and publisher of the IMA family of
fixed-income indexes for Brazilian federal public bonds. There is **no BCB SGS
mirror**; the indexes must be sourced from ANBIMA directly.

Three distribution surfaces exist:

| Surface | URL | Auth | Notes |
|---|---|---|---|
| Daily snapshot files (latest D-1) | `https://www.anbima.com.br/informacoes/ima/arqs/ima_completo.{txt,xls,xml}` | None | One file, current ref date only. |
| Per-date história série (consulta) | `https://www.anbima.com.br/informacoes/ima/ima-sh-down.asp` (POST) | None | Returns the full IMA-family quadro for an arbitrary past date. **Selected as primary endpoint.** |
| Official developer API | `https://api.anbima.com.br/feed/precos-indices/v1/indices/resultados-ima` | **OAuth2 client credentials (requires contract / Feed subscription)** | Returns JSON, intraday + closing. Not used here — see Open Q #1. |
| Per-index XLS historicals | `https://www.anbima.com.br/informacoes/ima/arqs/<INDICE>.xls` | None | Only `IMA-Geral ex-C.xls` and `IRF-M 1.xls`, `IRF-M 1+.xls` exist on the public CDN. Other index XLSes return HTTP 404. |

We standardize on the **`ima-sh-down.asp`** endpoint because it is the only
public, no-auth surface that:

1. Accepts any historical date (depth confirmed back to at least 2010-05-11).
2. Returns CSV, XML, XLS, or TXT in a uniform schema.
3. Carries all 12 sub-indexes in a single response.

## 2. Authentication

**None.** Public, anonymous HTTPS POST. No API key, no IP allowlist, no
session/cookie required. Server returns `Set-Cookie: ASPSESSIONID...` but
honoring it is not required for subsequent requests.

The official `api.anbima.com.br` developer API does require OAuth2 client
credentials issued via the ANBIMA Feed contract. We deliberately avoid it for
this iteration — see Open Q #1.

## 3. URL pattern + parameters

```
POST https://www.anbima.com.br/informacoes/ima/ima-sh-down.asp
Content-Type: application/x-www-form-urlencoded
```

Body (URL-encoded form):

| Field | Required | Value used | Description |
|---|---|---|---|
| `Pai` | yes | `ima` | Family root. Always `ima`. |
| `Tipo` | yes (may be empty) | *(empty)* | Sub-index filter. Empty returns the full quadro of all 12 sub-indexes. |
| `Dt_Ref` | yes | `DD/MM/YYYY` (e.g. `08/05/2026`) | Reference business date. Weekends / holidays return an empty body (HTTP 200, ~46 bytes). |
| `Dt_Ref_Ver` | yes | Any past date in `YYYYMMDD`, e.g. `20000101` | Server-side anti-forgery. The exact value is not validated against the current page; any reasonable date passes. |
| `escolha` | yes | `2` | `1` = render to screen, `2` = file download. |
| `Idioma` | yes | `PT` or `EN` | Output language. Adapter MUST use `PT` to preserve canonical names (`IMA-GERAL`, etc.). |
| `saida` | yes | `csv`, `xls`, `txt`, `xml` | Output format. Adapter uses `csv`. |
| `DataRef` | no | empty | Legacy hidden field; pass empty. |

## 4. Response format (saida=csv)

Returns `Content-Type: text/csv`, `Content-Disposition: attachment;
filename=IMA_SH_<DDMMYYYY>.csv`, **ISO-8859-1** encoded, **`;`-delimited**,
Portuguese locale (`,` decimal separator, `.` thousands).

Structure (lines):

1. `TOTAIS - QUADRO RESUMO` (section header)
2. Header row (18 columns)
3. One row per sub-index present on that date

Followed by a per-sub-index composition section (`CARTEIRA POR ÍNDICE`) which we
ignore for index-level ingestion. (Future scope: bond-level breakdown.)

Header columns (verbatim, pt-BR):

```
Índice;Data de Referência;Número Índice;Variação Diária(%);Variação no Mês(%);
Variação no Ano(%);Variação 12 Meses(%);Variação 24 Meses(%);Peso(%);
Duration(d.u.);Carteira a Mercado (R$ mil);Número de<BR>Operações *;
Quant. Negociada (1.000 títulos) *;Valor Negociado (R$ mil) *;PMR;
Convexidade;Yield;Redemption Yield
```

Note: column 12 contains a literal `<BR>` HTML tag inside the header — adapter
must normalize it.

Sample row (excerpt of `IMA_SH_08052026.csv`):

```
IMA-B;08/05/2026;11.521,718637;0,2080;0,4630;5,3350;11,7352;17,3087;24,09;
1.571;1.951.925.032;3.183;9.019,52;40.563.188,27;2.961;79,5323;7,7499;7,3323
```

## 5. Date format

Input: `DD/MM/YYYY` (pt-BR).
Output: `DD/MM/YYYY` in column 2 of each row.
Adapter normalizes to ISO `YYYY-MM-DD` on persist.

## 6. Update routine

- ANBIMA closes the IMA at end of trading day and **publishes by ~20:00 BRT**
  (per ANBIMA Developers portal note for the official API). Empirically
  `ima_completo.xls` had `Last-Modified: Mon, 11 May 2026 11:37:25 GMT` at
  20:15 BRT (= 23:15 UTC); the late morning timestamp suggests the file is
  regenerated multiple times per day but the **closing values for D land in the
  evening of D**.
- Recommended scheduler cadence: **daily at 21:30 BRT**, with retry at 23:00
  BRT and 06:00 BRT D+1.
- Weekends and B3 holidays: server returns HTTP 200 with body length
  ~46 bytes (empty TOTAIS block). Adapter must treat this as "no observation"
  rather than an error.

## 7. Per-index identifier mapping (12 codes)

The CSV `Índice` column uses these literal strings (pt-BR, with `PT` Idioma):

| Proposed series_id | ANBIMA `Índice` string in CSV | Notes |
|---|---|---|
| `anbima.ima_geral` | `IMA-GERAL` | All federal public bonds. |
| `anbima.ima_geral_ex_c` | `IMA-GERAL ex-C` | IMA-Geral minus NTN-C. |
| `anbima.ima_b` | `IMA-B` | NTN-B (IPCA + cupom). |
| `anbima.ima_b_5` | `IMA-B 5` | NTN-B duration ≤ 5y. |
| `anbima.ima_b_5_plus` | `IMA-B 5+` | NTN-B duration > 5y. |
| `anbima.ima_c` | `IMA-C` | NTN-C (IGP-M + cupom). **Present until ~2018; absent in current snapshots.** |
| `anbima.ima_c_5` | `IMA-C 5` | **Discontinued — absent in all sampled fixtures (2015, 2021, 2026).** |
| `anbima.ima_c_5_plus` | `IMA-C 5+` | **Discontinued — same as above.** |
| `anbima.irf_m` | `IRF-M` | LTN + NTN-F (prefixados). |
| `anbima.irf_m_1` | `IRF-M 1` | Prefixados ≤ 1y. |
| `anbima.irf_m_1_plus` | `IRF-M 1+` | Prefixados > 1y. |
| `anbima.ima_s` | `IMA-S` | LFT (SELIC). |

> Adapter must normalize the literal `IMA-GERAL ex-C` (mixed case) and
> `IMA-GERAL` (uppercase) deterministically. With `Idioma=EN` the names differ
> further — stick to `PT`.

## 8. Sample curl

```bash
curl -sL --max-time 20 -X POST \
  --data-urlencode "Pai=ima" \
  --data-urlencode "Tipo=" \
  --data-urlencode "DataRef=" \
  --data-urlencode "Idioma=PT" \
  --data-urlencode "saida=csv" \
  --data-urlencode "escolha=2" \
  --data-urlencode "Dt_Ref=08/05/2026" \
  --data-urlencode "Dt_Ref_Ver=20000101" \
  "https://www.anbima.com.br/informacoes/ima/ima-sh-down.asp" \
  -o IMA_SH_08052026.csv
```

Response headers (real capture, 2026-05-11):

```
HTTP/2 200
content-type: text/csv
content-length: 1672
content-disposition: attachment; filename=IMA_SH_08052026.csv
server: Microsoft-IIS/10.0
```

Sample payload snippet (first 4 lines after `iconv -f latin1 -t utf-8`):

```
TOTAIS - QUADRO RESUMO
Índice;Data de Referência;Número Índice;Variação Diária(%);...
IRF-M 1;08/05/2026;19.984,379876;0,0579;...
IRF-M 1+;08/05/2026;24.428,738313;0,2078;...
```

## 9. Known quirks

1. **Encoding:** ISO-8859-1 (Windows-1252-compatible). Adapter must decode
   explicitly; UTF-8 will mojibake `Variação`, `Índice`, etc.
2. **Decimal/thousands locale:** `,` decimal, `.` thousands — opposite of US.
   `11.521,718637` parses to `11521.718637`.
3. **Embedded HTML in header:** column 12 reads `Número de<BR>Operações *`.
   Adapter must strip `<BR>`.
4. **Empty-day response:** weekends/holidays/future dates return HTTP 200 with
   ~46-byte body (`TOTAIS - QUADRO RESUMO` only, no rows). Adapter must treat
   as no-observation.
5. **Anti-forgery field:** `Dt_Ref_Ver` is required but loosely validated. We
   pass `20000101`; ANBIMA's own page rotates this monthly but it does not seem
   to be enforced strictly.
6. **IMA-C runoff:** `IMA-C` rows present in 2015-era fixtures; absent in 2021
   and 2026 fixtures. The IMA-C family appears to be retired from the daily
   quadro after the NTN-C runoff. Seed for the three IMA-C series must mark
   end_observation accordingly.
7. **IMA-C 5 / IMA-C 5+:** not observed in **any** sampled fixture (2015, 2021,
   2026). These splits appear long discontinued. Confirm with ANBIMA
   methodology PDF before seeding.
8. **History depth:** confirmed reachable to at least 2010-05-11. The IMA was
   officially launched 2000-12-29 (base = 1000). Per-date crawl back to
   2000-12-29 should work; **rate-limit politely** (1 req/sec) to avoid IIS
   throttling.
9. **No bulk history endpoint:** there is no single "full series download"
   endpoint at the public surface. Backfill must iterate date-by-date. A 24-year
   history (~6000 business days) = ~6000 requests, ≈ 100 minutes at 1 rps.
10. **Per-index XLS exception:** `IMA-Geral ex-C.xls`, `IRF-M 1.xls`,
    `IRF-M 1+.xls` are downloadable as multi-year XLS workbooks — useful as
    a one-shot backfill optimization for those three series only.
11. **The `Índice` literal `IMA-GERAL ex-C`** contains a regular ASCII space; the
    `ima.asp` HTML page uses a stray tab character in its `href`
    (`href="arqs/IMA-Geral\tex-C.xls"`), which is a bug in their HTML — the
    actual file URL uses `%20`.

## 10. Suggested adapter strategy

**New `ANBIMAAdapter`** under `backend/src/api_extractor/extractors/anbima_ima.py`,
mirroring the shape of `BCBSGSAdapter` but with these distinctions:

- Fetch granularity: **one HTTP POST per business date**, returns all 12 (or 10
  with IMA-C retired) sub-indexes in one CSV — the adapter fans out one row per
  series_id, deduping by `(series_id, date)` upstream.
- Decoder pipeline: `bytes → decode("iso-8859-1") → csv.reader(delim=';') →
  skip non-data rows → map Índice → series_id → normalize numeric (replace
  thousands `.`, decimal `,` → `.`) → emit Observation(date, value)`.
- Polite throttle: 1 req/sec to `www.anbima.com.br`, max-retry 3 with backoff.
- Daily run mode: fetch only D-1 (or today if after 21:00 BRT).
- Backfill mode: iterate from start_date to today; **prefer per-index XLS
  workbooks for `IMA-Geral ex-C`, `IRF-M 1`, `IRF-M 1+`** to cut request count.
- Cache: store raw CSV per date under `cache/anbima_ima/IMA_SH_<DDMMYYYY>.csv`
  for replay; checksum-verify on re-fetch.

**Fallback / degraded mode (recommended for the OAuth API):** if licensing
requires it, replace transport with `requests-oauthlib` against
`https://api.anbima.com.br/feed/precos-indices/v1/indices/resultados-ima?data=YYYY-MM-DD`,
parse JSON. Same series_id mapping, same emit contract.

**Manual-CSV-upload fallback:** if at any point ANBIMA hardens the public
endpoint (login, captcha, IP allowlist), expose an admin upload route accepting
`IMA_SH_<DDMMYYYY>.csv` files (their native format) — adapter parses identically.

## 11. Fixtures captured (raw)

| File | Bytes | Source |
|---|---:|---|
| `backend/tests/fixtures/anbima_ima/IMA_SH_08052026.csv` | 1672 | POST `ima-sh-down.asp` Dt_Ref=08/05/2026 saida=csv |
| `backend/tests/fixtures/anbima_ima/IMA_SH_07052026.csv` | 1676 | POST `ima-sh-down.asp` Dt_Ref=07/05/2026 saida=csv |
| `backend/tests/fixtures/anbima_ima/IMA_SH_11052021.csv` | 1653 | POST `ima-sh-down.asp` Dt_Ref=11/05/2021 saida=csv |
| `backend/tests/fixtures/anbima_ima/IMA_SH_04052015.csv` | 1642 | POST `ima-sh-down.asp` Dt_Ref=04/05/2015 saida=csv (incl. IMA-C) |
| `backend/tests/fixtures/anbima_ima/IMA_SH_08052026.xml` | 3832 | POST `ima-sh-down.asp` saida=xml |
| `backend/tests/fixtures/anbima_ima/ima_completo.txt` | 34517 | GET `https://www.anbima.com.br/informacoes/ima/arqs/ima_completo.txt` |
| `backend/tests/fixtures/anbima_ima/ima_completo.xls` | 257024 | GET same path .xls |
| `backend/tests/fixtures/anbima_ima/ima_completo.xml` | 93942 | GET same path .xml |
| `backend/tests/fixtures/anbima_ima/IMA-Geral_ex-C.xls` | 146944 | GET `https://www.anbima.com.br/informacoes/ima/arqs/IMA-Geral%20ex-C.xls` (multi-year history) |
| `backend/tests/fixtures/anbima_ima/IRF-M_1.xls` | 267776 | GET `https://www.anbima.com.br/informacoes/ima/arqs/IRF-M%201.xls` (multi-year history) |

Verified parseable with `csv` + `iso-8859-1` (CSV files) and
`xml.etree.ElementTree` (XML files). XLS files require `xlrd<2.0` or LibreOffice
conversion at adapter time.

Smoke test: fetched 45 calendar days back from 2026-05-08, recovered **30
observations** each for IMA-GERAL, IMA-B, IRF-M — matches business-day count
including the May 1 holiday.

## 12. Classification proposal (for orchestrator review — DO NOT WRITE seed.json)

| Field | Value | Notes |
|---|---|---|
| Category | **Renda Fixa** | NEW category — needs orchestrator sign-off. |
| Source | **ANBIMA** | NEW source — needs orchestrator sign-off. |
| Frequency | `daily` (business days) | Confirmed via 45-day probe → 30 datapoints. |
| Unit | `índice` (base 2000-12-29 = 1000) | Per ANBIMA methodology. |
| Decimals | 6 (rendered with locale-aware formatting) | Values like `11521,718637`. |

Per-index `first_observation` (research best-effort; confirm against ANBIMA
methodology PDF before seeding):

| series_id | Proposed first_observation | Source of date |
|---|---|---|
| `anbima.ima_geral` | 2000-12-29 | IMA launch date. |
| `anbima.ima_geral_ex_c` | 2005-03-31 | Per `IMA-Geral ex-C.xls` page note. |
| `anbima.ima_b` | 2003-08-29 | NTN-B inception. Verify. |
| `anbima.ima_b_5` | 2007-03-30 | Per ANBIMA. Verify. |
| `anbima.ima_b_5_plus` | 2007-03-30 | Per ANBIMA. Verify. |
| `anbima.ima_c` | 2000-12-29 | IMA launch (NTN-C). end_observation: open Q #4. |
| `anbima.ima_c_5` | ? | **Open Q — never observed in fixtures.** |
| `anbima.ima_c_5_plus` | ? | **Open Q — never observed in fixtures.** |
| `anbima.irf_m` | 2000-12-29 | IMA launch. |
| `anbima.irf_m_1` | 2000-12-01 | Per `IRF-M 1.xls` page note. |
| `anbima.irf_m_1_plus` | 2000-12-01 | Per `IRF-M 1+.xls` page note. |
| `anbima.ima_s` | 2000-12-29 | IMA launch. |

## 13. Open questions for orchestrator

1. **Licensing / redistribution.** ANBIMA's terms of use (and the explicit
   gating of `api.anbima.com.br` behind a Feed contract) suggest IMA values are
   proprietary. We can technically scrape the public CSV endpoint, but legal
   redistribution via our public API needs sign-off. Options: (a) ingest +
   redistribute (legal risk), (b) ingest + render server-side only without
   public download (lower risk), (c) require users to BYO Feed credentials.
2. **New category `Renda Fixa`** in seed.json — confirm taxonomy fit. Currently
   we have B3/Yahoo (renda variável), BCB SGS (macro), IBGE SIDRA (inflação).
3. **New source `ANBIMA`** — confirm source-registry entry and licensing
   metadata.
4. **IMA-C end_observation.** Confirm against ANBIMA methodology whether
   IMA-C is still calculated (some methodology docs say yes, but our 2021/2026
   fixtures show it absent from the daily quadro). Decide: skip the 3 IMA-C
   series, or seed them with a frozen end_date.
5. **IMA-C 5 / IMA-C 5+.** Never observed in fixtures. Likely formally
   discontinued. Confirm via methodology PDF
   `https://www.anbima.com.br/data/files/C5/76/5F/D5/3AD0A6101AFEAE9678A80AC2/Metodologia_IMA_fechamento_1_.pdf`
   and drop from seed if discontinued.
6. **Backfill cost.** Full history (~6000 business days × 1 rps = ~100 min) is
   a one-shot operation but hammers ANBIMA's IIS. Approve politeness budget
   (default proposed: 1 rps + UA `api-extractor/0.1 (research)`).
7. **Use of official OAuth API.** If we have or can obtain ANBIMA Feed
   credentials, the official endpoint at `api.anbima.com.br` is the durable
   choice. Should we pursue contract / credentials?

## 14. Implementation notes (Wave B-1 — 2026-05-11)

The adapter described in §10 is implemented in
`backend/src/api_extractor/extractors/anbima_ima.py` and registered as
`source="ANBIMA"` via `backend/src/api_extractor/extractors/registry.py`.

Key implementation choices:

- **Index name matching.** `series.source_id` uses dash-joined uppercase
  (`IMA-GERAL-EX-C`, `IMA-B-5+`, `IRF-M-1`). The CSV `Índice` column uses
  space-separated mixed-case (`IMA-GERAL ex-C`, `IMA-B 5+`, `IRF-M 1`). The
  helper `_normalize_index_name` uppercases + replaces whitespace runs with
  `-` on both sides before comparison.
- **Decimal parsing.** `_parse_pt_br_decimal` strips thousand-separator dots
  then replaces the decimal comma with a dot, never going through `float`.
  Returns `Decimal`. Raises on empty / `--` sentinels.
- **Business-date iteration.** Only Mon–Fri are POSTed; holidays are detected
  at response time (empty body, no rows after the TOTAIS header) and
  silently skipped — no calendar lookup needed.
- **Throttle.** 1.0s `asyncio.sleep` between successive POSTs in one fetch
  run; not before the first request, not after the last.
- **Retries.** tenacity 3x with `wait_exponential(multiplier=2, min=2, max=30)`,
  retrying only on transport errors / 5xx / 429. Three failed attempts raise
  `ExtractionError`.
- **Encoding.** Response bytes decoded as ISO-8859-1 (`errors="replace"` for
  paranoia). UTF-8 would mojibake `Variação`, `Índice`, etc.
- **Empty-body handling.** Weekends, holidays, and pre-publication future
  dates return HTTP 200 with ~46 bytes (TOTAIS header only). Adapter treats
  these as "no observation" — no error, no retry.

Unit tests in `backend/tests/test_extractor_anbima.py` cover: pt-BR locale
parsing, ISO-8859-1 decoding, index normalization, business-date iteration,
fixture round-trip, empty-body skip, multi-series filter, and retry
exhaustion → `ExtractionError`.

Live smoke (2026-05-11, `since=2026-05-01`): recovered 5 observations for
`IMA-Geral` (2026-05-04 through 2026-05-08); 2026-05-01 correctly skipped as
a Labor Day holiday with empty-body response. Latency ~7.7 s end-to-end with
1 rps throttle across 6 business days.

Out of scope for Wave B-1 (deferred to Wave C orchestrator):

- Full 6000-day backfill from `first_observation`.
- Per-index XLS workbook fast-path (`IMA-Geral ex-C.xls`, `IRF-M 1.xls`,
  `IRF-M 1+.xls`).
- Holiday-calendar pre-filtering (current implementation is server-driven).
- Raw-CSV cache to disk for replay.
- Scheduler integration for the 21:30 BRT nightly cadence.

---

## Full-history retrieval (research, 2026-05-11)

**Goal.** Replace the per-date `POST ima-sh-down.asp` loop (1 req/business-day,
~6 200 calls = ~16 h at 1 rps) with a bulk endpoint that returns the entire
history of one or more IMA sub-indexes in a single request.

### Endpoints tested (all live, from inside the `api` container)

| # | Surface | URL | Result |
|---|---|---|---|
| 1 | Per-index XLS time series (legacy CDN) | `https://www.anbima.com.br/informacoes/ima/arqs/<INDICE>.xls` | Only `IMA-Geral ex-C.xls` (HTTP 200, 147 KB, 1 278 rows ending **2010-05-03**) and `IRF-M 1.xls` (HTTP 200, 261 KB) exist. All other names tested (`IMA-Geral`, `IMA-B`, `IMA-S`, `IRF-M`, `IRF-M 1+`, `IMA-B 5`, `IMA-B 5+`, plus 10+ casing/encoding variants) return HTTP 404. The two files that exist are **stale legacy snapshots ending 2010** — NOT usable for current backfill. |
| 2 | Daily-snapshot bundle | `https://www.anbima.com.br/informacoes/ima/arqs/ima_completo.{xls,txt,xml}` | HTTP 200, ~250 KB XLS / 34 KB TXT / 94 KB XML. **Single reference date only** (D-1, full IMA-family quadro-resumo + portfolio composition per sub-index). Not historical. |
| 3 | Self-extracting archive (referenced as commented-out HTML on `ima-sh.asp`) | `arqs/ima.exe`, `arqs/ima_ate310305.exe` | HTTP 404. Removed from the CDN. |
| 4 | `ima-sh-down.asp` with date-range params | `POST` with `Dt_Inicio` / `Dt_Fim` / `Periodo=mes` / `Periodo=anual` / `Tipo=hist` / `escolha=3` | All ignored. Endpoint always responds with **single-date** payload (1.6 KB) for whichever `Dt_Ref` is supplied (or empty 46-byte body if missing). `Tipo=hist` returns HTTP 500. **No hidden range mode.** |
| 5 | `data.anbima.com.br` SPA bond series | `GET https://data.anbima.com.br/api/series/{CODIGO}/precificacao/anbima?page=…&size=…` | Endpoint exists but serves **bond-level pricing** (`puIndicativo`, `taxa`, `duration`) keyed by CETIP/ISIN — not IMA index numbers. All IMA codes tested return HTTP 404. |
| 6 | **`data-api.prd.anbima.com.br` BFF — historical variation** | `GET https://data-api.prd.anbima.com.br/web-bff/v2/indices/variacao-historica?benchmarks=<CODE,CODE>&data-inicio=YYYY-MM-DD&data-fim=YYYY-MM-DD` *(alternate: `&periodo=<N>`)* | HTTP 401 `{"msg":"token cannot be blank"}` without reCAPTCHA. **This is the bulk endpoint.** Discovered by reverse-engineering the Next.js bundle (`/_next/static/chunks/3579-c3c5a4e107c7b39c.js`). Same BFF also serves `/web-bff/v1/indices-anbima/quadro-resumo`, `/componentes-resultados-diarios`, `/quantidade-mercado`, `/resultados-intradiarios`. |

### The official IMA family codes (verbatim from the SPA bundle)

```js
ima: [
  {name:"IRF - M 1",         code:"IRFM1",        path:"irf-m-1"},
  {name:"IRF - M 1+",        code:"IRFM1MAIS",    path:"irf-m-1-mais"},
  {name:"IRF - M",           code:"IRFM",         path:"irf-m"},
  {name:"IMA - B 5",         code:"IMAB5",        path:"ima-b-5"},
  {name:"IMA - B 5+",        code:"IMAB5MAIS",    path:"ima-b-5-mais"},
  {name:"IMA - B",           code:"IMAB",         path:"ima-b"},
  {name:"IMA - S",           code:"IMAS",         path:"ima-s"},
  {name:"IMA - Geral ex-C",  code:"IMAGERALEXC",  path:"ima-geral-ex-c"},
  {name:"IMA - Geral",       code:"IMAGERAL",     path:"ima-geral"},
  // sub-series (not in current scope, but available):
  {name:"IRF - M P2",        code:"IRFMP2"},
  {name:"IRF - M P3",        code:"IRFMP3"},
  {name:"IMA - B 5 P2",      code:"IMAB5P2"},
  {name:"IMA - C",           code:"IMAC"},
]
```

Mapping to our 9 target series is exact and 1:1 (Phase-20b canonical names
match `name` above modulo the spaces around the hyphen).

### Auth (the gate)

The BFF is fronted by **Google reCAPTCHA v3**, not OAuth. Each request must
carry header `g-google-authorization: <token>` where `<token>` is issued by
`grecaptcha.execute(siteKey, {action: "ANBIMA_Data"})` against site key
`6LdQINIUAAAAAHSVujefm3ZsQnM-3gRqmug7dlFH`. Live curl evidence:

```
$ curl https://data-api.prd.anbima.com.br/web-bff/v1/indices-anbima?familia=IMA
HTTP/1.1 401 Unauthorized
{"msg":"token cannot be blank"}
```

On HTTP 418 the SPA's axios interceptor re-solves the captcha and retries —
i.e. tokens are single-use-ish, short-lived. There is no public client_id /
client_secret flow; **no header-only auth path exists**.

### Curl evidence (selected)

```
GET https://www.anbima.com.br/informacoes/ima/arqs/IMA-Geral ex-C.xls
  -> 200, 146 944 B, application/vnd.ms-excel (OLE2, sheet ends 2010-05-03)
GET https://www.anbima.com.br/informacoes/ima/arqs/IRF-M 1.xls
  -> 200, 267 776 B
GET https://www.anbima.com.br/informacoes/ima/arqs/ima_completo.xls
  -> 200, 257 024 B, single reference date 2026-05-08
POST ima-sh-down.asp  Periodo=anual Dt_Ref=31/12/2024
  -> 200, 1 622 B, ONE row per sub-index for 31/12/2024 only (Periodo ignored)
GET https://data-api.prd.anbima.com.br/web-bff/v2/indices/variacao-historica?benchmarks=IMAB
  -> 401, {"msg":"token cannot be blank"}
```

### Conclusion — what's actually available

1. **No public, no-auth bulk endpoint exists.** All ANBIMA CDN historical
   files are either single-date snapshots or stale legacy XLSes truncated at
   2010.
2. **A bulk JSON endpoint DOES exist** (`/web-bff/v2/indices/variacao-historica`)
   and **does** accept a `data-inicio`/`data-fim` range plus a `benchmarks=CSV`
   filter, which would collapse our 9-series × 25-year backfill into **as few
   as 1 request** (or 9, one per series, if benchmark CSV is capped). It is
   protected by reCAPTCHA v3 and therefore unreachable from a server-side
   HTTP client without a captcha-solving service (2Captcha, CapSolver, etc.)
   or a headless-browser worker.
3. **The official ANBIMA Feed** (`api.anbima.com.br/feed/precos-indices/v1/
   indices/resultados-ima`) is the only contractual route. It returns JSON,
   accepts a date filter, and is auth'd via OAuth2 client_credentials issued
   under a paid ANBIMA Feed subscription (contact `anbimafeed@anbima.com.br`).

### Recommendation

For a **production-quality 25-year backfill**, we have three viable paths,
in order of preference:

| Option | Backfill latency | Ongoing cost | Risk |
|---|---|---|---|
| **A. ANBIMA Feed (OAuth2, paid)** | ~minutes (1 call/series, full history) | Monthly subscription (~quote required) | Lowest. Contractual SLA, no captcha breakage. **Recommended.** |
| **B. Headless-browser worker against `web-bff/v2/indices/variacao-historica`** | ~minutes (1–9 calls total) | Free + Playwright/Chromium overhead | Medium. ToS is unclear; reCAPTCHA action `ANBIMA_Data` is bound to `data.anbima.com.br` origin, so worker must run in a real browser context. Endpoint shape can change without notice. |
| **C. Keep `ima-sh-down.asp` per-date loop (current adapter)** | ~16 h at 1 rps for 25 yr | Free | Lowest legal risk, highest latency. Acceptable as a *one-time* backfill in a background job. |

If we stay with Option C for now, the only speedups available without auth
are: (i) bumping concurrency to 3–5 rps and watching for 429s, (ii) skipping
weekends/holidays client-side using a B3 calendar (already trivially detected
server-side via 46-byte empty body), and (iii) caching raw CSV to disk.
**None of these turn a 1-day-per-request API into a bulk endpoint.**

### Estimated request counts (25 years, ~6 200 business days)

| Strategy | Requests for 9 series × 25 yr |
|---|---|
| Current per-date POST (each call returns all 9) | 6 200 |
| Per-date POST × 9 sub-index filters | 55 800 (no benefit — current adapter already gets all 9 per call) |
| `web-bff/v2/indices/variacao-historica?benchmarks=IRFM1,IRFM1MAIS,…,IMAGERAL` (single shot) | **1** |
| Same, but split per series if `benchmarks` is length-capped (untested) | **9** |
| ANBIMA Feed `resultados-ima` paged at e.g. 1 yr / call | ~25 (or fewer if larger ranges accepted) |

### Implementation strategy (if we adopt the BFF + headless worker — Option B)

1. New module `backend/src/api_extractor/extractors/anbima_ima_bulk.py`.
2. Use Playwright (Chromium) in the worker container; reuse the existing
   `api` service's network, mount a dedicated profile dir.
3. Boot Playwright → navigate to `https://data.anbima.com.br/indices` to
   warm the reCAPTCHA v3 origin → call
   `await page.evaluate(() => grecaptcha.execute(SITE_KEY,
   {action:'ANBIMA_Data'}))` to obtain a token.
4. From the same page context, `fetch('https://data-api.prd.anbima.com.br/
   web-bff/v2/indices/variacao-historica?benchmarks=IRFM1,IRFM1MAIS,IRFM,
   IMAB5,IMAB5MAIS,IMAB,IMAS,IMAGERALEXC,IMAGERAL&data-inicio=2000-12-29&
   data-fim=2026-05-11', { headers: { 'g-google-authorization': token,
   'Params': location.search }})`.
5. Parse JSON, persist to the same Phase-20b ingestion tables that the
   `ima-sh-down.asp` adapter writes to.
6. On HTTP 418, re-issue token (mirrors the SPA's own retry).
7. Fall back to the per-date adapter for any gap not covered by the bulk
   response (so the per-date path stays as the canonical "single date of
   truth" surface).

**Speedup vs. current adapter:** if the bulk endpoint accepts a 25-year
range in one shot, end-to-end backfill drops from **~16 h** to **<30 s**
(captcha solve ~3 s + JSON parse + DB insert) — roughly **2 000× faster**.
Even worst case (9 requests, captcha per request) lands at <60 s.

### Recommendation summary

- **Short-term:** Land the per-date adapter as-is (Wave B-1, already done)
  and run the 25-year backfill once as a background job (~16 h, acceptable).
- **Medium-term:** Initiate the **ANBIMA Feed (OAuth2)** subscription
  conversation with `anbimafeed@anbima.com.br`. This is the only contractual
  path to a true bulk-history endpoint and unblocks daily refresh < 5 s.
- **Avoid:** the headless-browser/reCAPTCHA workaround (Option B) for any
  production workload — fragile, against the spirit of the rate-limit, and
  one Strapi/Next.js refactor away from breaking.

### Reproducibility artifacts

All curl commands above were executed inside `api-api-1` (Debian 13 / curl
8.x) on 2026-05-11. The relevant JS bundle for the discovery of the BFF
endpoint, family codes, and reCAPTCHA site key is
`https://data.anbima.com.br/_next/static/chunks/3579-c3c5a4e107c7b39c.js`
(buildId `BLFV12Xz4JeFbVwG2-zTg`). The same bundle exposes
`url_download_historico` as a server-rendered string per index — its actual
value is only obtainable post-authentication (it is part of the BFF
`indices-anbima` payload, not a static asset), which is why the URL-pattern
probes for `historicos/<CODE>.xls` all 404.

---

## Bulk-history retrieval — IMPLEMENTED (Phase 20 Wave D)

The `url_download_historico` field referenced above turns out to be a public
S3 object hosted by ANBIMA — no Firebase token, no captcha, no OAuth.
Discovery: clicking "Baixar histórico (XLS)" on data.anbima.com.br/indices
issues a plain anonymous `GET` to:

```
https://s3-data-prd-use1-precos.s3.us-east-1.amazonaws.com/arquivos/indices-historico/{CODE}-HISTORICO.xls
```

The file is XLSX (PK signature) despite the `.xls` extension. Single sheet
`Historico` with columns: `Índice`, `Data de Referência`, `Número Índice`,
plus 5 variation columns, `Duration (d.u.)`, and `PMR`. Each file holds the
full history of a single index from inception (typically 2001–2007) to the
latest business day.

### Adapter

Module: `api_extractor.extractors.anbima_bulk.ANBIMABulkAdapter` —
registered as the canonical `"anbima"` adapter in
`api_extractor.extractors.registry`.

- One HTTP GET per series via `httpx.AsyncClient`.
- Parsing in a worker thread (`asyncio.to_thread` + `pandas.read_excel`
  with `engine='openpyxl'`).
- 3× tenacity retry on transient transport errors and on 5xx / 429.
- `since=` filters by `Data de Referência >= since`.
- Each file = single index — no name-based row filtering required.

The previous per-date scraper (`anbima_ima.py`) is retained as deprecated;
its tests still pass but it is no longer wired into the registry.

### Indexes covered (30)

Each code below corresponds to a file `{CODE}-HISTORICO.xls` in the S3
bucket. The left column is the canonical `series.code` we use; the right
column is the `source_id` (= S3 file code) we store and use to build the
URL.

| series.code             | source_id (S3 file code)   |
| ----------------------- | -------------------------- |
| IMA-Geral               | IMAGERAL                   |
| IMA-Geral_ex-C          | IMAGERALEXC                |
| IMA-B                   | IMAB                       |
| IMA-B_5                 | IMAB5                      |
| IMA-B_5plus             | IMAB5MAIS                  |
| IMA-B_5_P2              | IMAB5P2                    |
| IRF-M                   | IRFM                       |
| IRF-M_1                 | IRFM1                      |
| IRF-M_1plus             | IRFM1MAIS                  |
| IRF-M_P2                | IRFMP2                     |
| IRF-M_P3                | IRFMP3                     |
| IMA-S                   | IMAS                       |
| IHFA                    | IHFA                       |
| IDA_Geral               | IDAGERAL                   |
| IDA_DI                  | IDADI                      |
| IDA_IPCA                | IDAIPCA                    |
| IDA_IPCA_Infra          | IDAIPCAINFRAESTRUTURA      |
| IDA_IPCA_ExInfra        | IDAIPCAEXINFRAESTRUTURA    |
| IDA_Liq_Geral           | IDALIQGERAL                |
| IDA_Liq_DI              | IDALIQDI                   |
| IDA_Liq_IPCA            | IDALIQIPCA                 |
| IDA_Liq_IPCA_Infra      | IDALIQIPCAINFRAESTRUTURA   |
| IDKA_PRE_3M             | IDKAPRE3M                  |
| IDKA_PRE_1A             | IDKAPRE1A                  |
| IDKA_PRE_2A             | IDKAPRE2A                  |
| IDKA_PRE_3A             | IDKAPRE3A                  |
| IDKA_PRE_5A             | IDKAPRE5A                  |
| IDKA_IPCA_2A            | IDKAIPCA2A                 |
| IDKA_IPCA_3A            | IDKAIPCA3A                 |
| IDKA_IPCA_5A            | IDKAIPCA5A                 |

### Open question — IDKA IPCA Infraestrutura subindexes

The ANBIMA "Índices" UI lists four additional IDKA-IPCA-Infraestrutura
buckets (2A, 3A, 5A, and an aggregate). Every reasonable filename variant
under `arquivos/indices-historico/` returns HTTP 403 from S3, and the
client-side build no longer ships a static URL pattern (it derives the URL
from the authenticated `web-bff` payload). These four indexes are therefore
**deferred** until we can capture an authenticated `url_download_historico`
value or ANBIMA publishes the IDKA-Infra files at a discoverable path.

### Backfill performance

Wall-clock cost of the full 30-series backfill (one container, sequential
calls, end-to-end including DB upsert):

```
30 series, 121 510 observations total, ~3 min wall-clock.
```

Per-series payloads range from 380 KB (IMAGERAL) to ~25 KB (newer
sub-indexes). The dominant cost is XLSX parsing, not the S3 GET.
