# Phase 9b — Extractor Bug Fixes (post-W5 backfill)

Targeted fixes for failures observed when running `POST /admin/backfill` after the W5 live backfill across 25 seeded series. Surgical edits only — no refactor of the `SourceAdapter` contract, no dependency bumps.

## Root-cause analysis

W5 live backfill against all 25 series surfaced three distinct extraction bugs.

### Bug 1 — BCB SGS daily-series + missing/oversized window

Symptom: `HTTPStatusError "406 Not Acceptable"` for PTAX_USD (id=1), PTAX_EUR (id=21619), Reservas_Internacionais (id=13621), CDI (id=12), SELIC (id=432), SELIC_meta (id=1178), TR (id=226).

Probe (from inside `api` container):

```text
GET /dados/serie/bcdata.sgs.1/dados?formato=json
→ 200 OK, body: {"error":"O sistema aceita uma janela de consulta de, no máximo, 10 anos em séries de periodicidade diária", ...}

GET /dados/serie/bcdata.sgs.1/dados?formato=json&dataInicial=01/01/1984&dataFinal=11/05/2026
→ same JSON-object error envelope (range > 10y)

GET /dados/serie/bcdata.sgs.1/dados?formato=json&dataInicial=12/05/2016&dataFinal=11/05/2026
→ 200 OK, body is a JSON array (window ≤ 10y, OK)
```

httpx surfaces the BCB error envelope as **HTTP 406** at the response layer (the upstream sends the JSON 200 in some cases and 406 in others depending on UA / Accept negotiation — they treat "daily without window" as Not Acceptable). Either way: for daily SGS series, the adapter must **always** send a `dataInicial`/`dataFinal` window of ≤ 10 years.

Fix: when `since is None` for any BCB SGS request, send `dataInicial = today − 10 years + 1 day` and `dataFinal = today`. We don't have frequency on the call signature, but the safe behavior is "always send a window when none is given." Monthly series accept this too (we verified `01/01/1979–11/05/2026` returns a list of monthly observations). This change is a no-op for incremental fetches (`since != None`) which already work.

Additionally, **chunk** large historical windows for daily series: if the requested span exceeds 10 years (since the seed `first_observation` for daily series like PTAX is 1999 / 1984), the adapter must fetch in ≤ 10-year windows and merge. For now we leave the `since=...` parameter alone (extraction_service passes `last_success_at.date()`, which is recent), and only chunk on the "full history" path.

### Bug 2 — CDI `'str' object has no attribute 'get'`

Same upstream behavior: when CDI's `/dados?formato=json` is hit without window, BCB returns a JSON **object** (`{"error": "...", "message": "..."}`) with status 200 in some content negotiations, instead of the expected JSON array. The adapter's `_parse_payload` iterated rows assuming list-of-dicts; iterating a dict yields string keys, and `row.get("valor")` blew up.

By fixing Bug 1 (always send window) the upstream stops returning the error envelope. But we still add a **defensive parse check**: if the response payload is not a list, raise `ExtractionError` with a clear message including the upstream-reported error.

### Bug 3 — Rendimento_Medio missing `IBGE_VARIABLE_MAP` entry

`IBGESidraAdapter.fetch` raises `ExtractionError("No IBGE_VARIABLE_MAP entry for series code 'Rendimento_Medio'")`. The map needs an entry.

Probed table 6390 via `https://apisidra.ibge.gov.br/values/t/6390/n1/all/v/all/p/last`. Available variables include:
- **5933** "Rendimento médio mensal real das pessoas de 14 anos ou mais de idade ocupadas… habitualmente recebido em todos os trabalhos" (unit: R$) — matches the seed `Rendimento_Medio` (`R$/pessoa`).
- 5941, 8832, 8833, 8836, 8837, … — CV and variation metrics, not the headline.

Note: `Massa_Salarial` already uses table 6390 + variable 5933 + no classification with `frequency="monthly"` (period codes step monthly: `202601`, `202602`, …, even though each represents a trimestre móvel of 3 months). The same shape is correct for `Rendimento_Medio`.

Side note: the DB seed has `frequency="quarterly"` for Rendimento_Medio. The adapter-side `_SidraSpec.frequency` is used purely for **period-code parsing** (monthly stepping codes like `YYYYMM`), independent of how the value is described editorially. The right value here is `"monthly"`.

## Plan

### File ownership

EDIT:
- `backend/src/api_extractor/extractors/bcb_sgs.py` — always send window for `since=None`, chunk windows > 10y, defensive parse for non-list payloads.
- `backend/src/api_extractor/extractors/ibge_sidra.py` — add `Rendimento_Medio` entry to `IBGE_VARIABLE_MAP`.
- `backend/tests/test_extractor_bcb.py` — regression tests for window emission, chunked fetch, non-list payload defensive parse.
- `backend/tests/test_extractor_ibge.py` — regression test for `Rendimento_Medio` map entry + URL build.
- `docs/data-sources/bcb-sgs.md` — document the 10-year window quirk and chunking strategy.
- `docs/data-sources/ibge-sidra.md` — add Rendimento_Medio row + clarify trimestre móvel period stepping.

DO NOT TOUCH:
- Any other backend file.
- Frontend.
- `pyproject.toml`.
- SourceAdapter interface.
- DB schema / seed (seed `frequency` field is purely editorial; adapter map controls parsing).

### Implementation outline

bcb_sgs.py:
- Compute window helper: `(today - 10y + 1d, today)`.
- In `fetch`: when `since is None`, set `since_effective = today - 10y + 1d`. (Document: this only affects the very-first run for a series; subsequent incremental runs already pass `since`.) Optional chunking is done by iterating `[max(since, today-10y), today]` windows. We'll implement chunking generically: produce a list of (start, end) pairs covering `[since_effective, today]` each ≤ 10 years; concatenate observations; dedupe by `(observed_at)`; sort.
- Defensive parse: if HTTP 200 body is not a list, surface as `ExtractionError` (don't `row.get` on a dict).

ibge_sidra.py:
- Add `Rendimento_Medio` to `IBGE_VARIABLE_MAP`: table `"6390"`, variable `"5933"`, classification `None`, frequency `"monthly"`.

### Expected outcome

- Live re-backfill: at least PTAX_USD, PTAX_EUR, Reservas_Internacionais, CDI, SELIC, SELIC_meta, TR, and Rendimento_Medio should succeed.
- IPCA, INPC, IGP-DI, IGP-M, IPCA-15, Balanca_Comercial, Conta_Corrente, Divida_Bruta, Resultado_Primario, IBC-Br, CAGED were already-successful series whose subsequent incremental call returns 404 (no new data since today). That is **not** a real extraction failure — it's a "no observations today" condition that BCB encodes as 404. Treat 404-with-`since=today` as "success, zero new obs." This is in scope as part of Bug 1's defensive handling.

## Testing

- `pytest backend/tests/test_extractor_bcb.py backend/tests/test_extractor_ibge.py -v`
- `pytest backend/tests/ -q` (full suite)
- Live `POST /admin/backfill` → expect ≥ 22 / 25 success.
