# Banco Central do Brasil — SGS (Sistema Gerenciador de Séries Temporais)

**Owner:** Phase 2 BCB SGS adapter (`backend/src/api_extractor/extractors/bcb_sgs.py`)
**Last verified:** 2026-05-11 against live endpoint

## Base URL

```
https://api.bcb.gov.br/dados/serie/bcdata.sgs.{series_id}/dados
```

Optional path shortcut for last N observations:

```
https://api.bcb.gov.br/dados/serie/bcdata.sgs.{series_id}/dados/ultimos/{N}
```

## Authentication

**None.** Public, anonymous HTTPS GET. No API key, no IP allowlist.

## Query parameters

| Name | Required | Format | Description |
|---|---|---|---|
| `formato` | yes | `json` \| `csv` | Response format. Adapter uses `json`. |
| `dataInicial` | no | `DD/MM/YYYY` | Inclusive lower bound. Omit for full history. |
| `dataFinal` | no | `DD/MM/YYYY` | Inclusive upper bound. Omit for "until today". |

## Response schema (formato=json)

Returns `application/json; charset=utf-8`, an array of `{data, valor}` objects:

```json
[
  {"data": "01/01/2017", "valor": "0.38"},
  {"data": "01/02/2017", "valor": "0.33"},
  {"data": "01/03/2017", "valor": "0.25"}
]
```

- `data` — `DD/MM/YYYY` string. For monthly series, BCB returns the **first day** of
  the reference month (`01/MM/YYYY`). For daily series, the calendar day. For event
  series (e.g., COPOM SELIC meta), the decision date.
- `valor` — Numeric value rendered as **string**. With `formato=json`, the decimal
  separator is a **dot** (`"0.38"`). With `formato=csv`, it is a comma (`"0,38"`).
  Adapter parses both defensively.

Empty range / unknown series id → HTTP 200 with body `[]` (empty array).

## Status codes

| Code | Meaning |
|---|---|
| 200 | Success (body may be `[]`) |
| 404 | Invalid series id **or** window contains zero observations (daily series queried for a single day before publication). Adapter treats 404 as "no observations in this window," not a failure. |
| 406 | Daily series requested without a window, or with a window > 10 years. See "10-year window cap" quirk below. |
| 429 | Rate-limited (transient) |
| 5xx | Upstream BCB outage (transient — retry) |

## Rate limits

No official figure published. Observed in practice: requests are cached
upstream (response `cache-control: max-age=900`, 15 min). Heavy parallel hits
to distinct series IDs work fine. Recommended throttle: ≤ 5 concurrent requests
to the host, exponential backoff on 429/503.

## Date format

- **Request** (`dataInicial`/`dataFinal`): `DD/MM/YYYY` (pt-BR).
- **Response** (`data`): `DD/MM/YYYY` (pt-BR).
- Adapter converts response to timezone-aware UTC `datetime` anchored at 00:00.

## Value format

- String with dot decimal under `formato=json` (`"5.6937"`).
- Parsed to `decimal.Decimal` via string round-trip. Never via `float`.
- `valor: null` is theoretically possible for missing days — adapter skips those.

## Known quirks

1. **Revisions** — IBGE/FGV/BCB may revise past months. Same `data` may return
   a different `valor` later. Repository upsert + revision table handles this.
2. **Holidays** — daily series have no rows on weekends and Brazilian holidays.
3. **Monthly anchor** — always first day of the month (`01/MM/YYYY`), regardless
   of publication date.
4. **Event series** (e.g., SELIC meta id 1178) — rows only on COPOM meeting dates.
5. **Last value lag** — daily series usually published the next business day.
6. **No pagination** — full history returned in one response. IPCA from 1980 is
   ~550 rows (~20 KB JSON). Monthly/event series accept any window width.
7. **10-year window cap (daily series)** — BCB rejects daily-series requests
   that either (a) omit `dataInicial`/`dataFinal` entirely or (b) span more
   than 10 years. The rejection arrives as **HTTP 406** at the response layer
   and/or as a JSON 200 with body `{"error": "O sistema aceita uma janela de
   consulta de, no máximo, 10 anos em séries de periodicidade diária", ...}`.
   Adapter mitigation (W5b):
   - Always emits both `dataInicial` and `dataFinal` (even when `since` is
     `None` — in that case `dataFinal = today` and `dataInicial` walks back
     from `today` in ≤ 10-year hops to `Series.first_observation`).
   - Splits historical fetches into ≤ 10-year windows and dedupes by
     `observed_at`.
   - Defensive parse: if a 2xx response body is not a JSON array, surfaces an
     `ExtractionError` rather than crashing inside `_parse_payload` (the
     pre-W5b failure mode was `'str' object has no attribute 'get'` for CDI).
8. **404 = no data in window** — for daily series queried at `since=today`
   before the daily publication, BCB returns 404 with no body. Adapter
   normalizes that to an empty observation list (status `success`, 0 rows
   upserted) instead of treating it as a hard failure.

## Per-series table

| Code | source_id | freq | Sample curl |
|---|---|---|---|
| IPCA | 433 | monthly | `curl 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados/ultimos/3?formato=json'` |
| IPCA-15 | 7478 | monthly | `curl 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.7478/dados/ultimos/3?formato=json'` |
| IGP-M | 189 | monthly | `curl 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.189/dados/ultimos/3?formato=json'` |
| IGP-DI | 190 | monthly | `curl 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.190/dados/ultimos/3?formato=json'` |
| INPC | 188 | monthly | `curl 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.188/dados/ultimos/3?formato=json'` |
| SELIC | 432 | daily | `curl 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados/ultimos/5?formato=json'` |
| SELIC_meta | 1178 | event | `curl 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.1178/dados/ultimos/3?formato=json'` |
| CDI | 12 | daily | `curl 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados/ultimos/5?formato=json'` |
| TR | 226 | daily | `curl 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.226/dados/ultimos/5?formato=json'` |
| PTAX_USD | 1 | daily | `curl 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados/ultimos/5?formato=json'` |
| PTAX_EUR | 21619 | daily | `curl 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.21619/dados/ultimos/5?formato=json'` |
| IBC-Br | 24364 | monthly | `curl 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.24364/dados/ultimos/3?formato=json'` |
| CAGED | 28763 | monthly | `curl 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.28763/dados/ultimos/3?formato=json'` |
| Resultado_Primario | 5793 | monthly | `curl 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.5793/dados/ultimos/3?formato=json'` |
| Divida_Bruta | 13762 | monthly | `curl 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.13762/dados/ultimos/3?formato=json'` |
| Balanca_Comercial | 22707 | monthly | `curl 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.22707/dados/ultimos/3?formato=json'` |
| Reservas_Internacionais | 13621 | monthly | `curl 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.13621/dados/ultimos/3?formato=json'` |
| Conta_Corrente | 22701 | monthly | `curl 'https://api.bcb.gov.br/dados/serie/bcdata.sgs.22701/dados/ultimos/3?formato=json'` |

## Open question — SELIC_meta frequency

`series.frequency = "event"` (COPOM decisions, ~8/year). BCB still returns it via
the same SGS endpoint. Scheduler in Phase 3 polls daily and lets idempotent upsert
no-op when no new event row appears. No special-case logic needed in the adapter.

## Captured fixtures

Real payloads captured 2026-05-11 (live API hit):

- `backend/tests/fixtures/bcb_sgs/ipca_433.json` — IPCA 2017–2025 (108 rows)
- `backend/tests/fixtures/bcb_sgs/selic_432.json` — SELIC Jun–Dec 2025 (214 rows)
- `backend/tests/fixtures/bcb_sgs/ptax_1.json` — PTAX USD Jun–Dec 2025 (150 rows)

## Daily series (auto-fetched)

These 5 BCB SGS series + 1 event series fire via the `daily_batch` scheduler job every Mon-Fri 18:00 BRT:

| Code | source_id | Description |
|---|---|---|
| SELIC | 432 | Taxa SELIC diária (acumulada no mês) |
| CDI | 12 | Certificado de Depósito Interbancário |
| TR | 226 | Taxa Referencial |
| PTAX_USD | 1 | PTAX venda R$/US$ |
| PTAX_EUR | 21619 | PTAX venda R$/EUR |
| SELIC_meta | 1178 | SELIC Meta (event-cadence, polled daily — no-op on non-event days) |

The Painel page renders these in the "Diariamente" row under the calendar strip.

## Multi-measure roadmap (Phase 18 stage 1 complete)

`series.measures` jsonb column + `observations.measure_key` PK extension are live. Each BCB-sourced series may declare alternative measures with their own `source_id`:

- **PIB (currently IBGE 5932)**: roadmap also covers SGS-sourced measures if BCB exposes them
- **IBC-Br (currently SGS 24364, índice)**: planned `pct_mom` (SGS 24365), `pct_yoy` (SGS 24363)
- **IPCA (currently SGS 433, % a.m.)**: planned `pct_12m` via SGS 13522
- **Reservas_Internacionais (currently SGS 13621, total)**: planned `liquidez` via SGS 13982

Stages 2–5 (seed, extractors, API, frontend) deferred. Adapter's `fetch(series, since)` signature will gain an optional `measure: dict | None` parameter that overrides `source_id` with the measure-specific id.
