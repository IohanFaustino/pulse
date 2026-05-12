# ADR-0008: Release calendar — scrape official with hardcoded fallback

## Status
Accepted — 2026-05-11

## Context
Calendário page needs known release dates (E events) to display ahead-of-time. Official sources (IBGE, BCB) publish annual calendars in HTML/PDF. Format is not always machine-friendly. Fallback strategy needed.

## Decision
Weekly scraper job pulls IBGE + BCB release calendars and upserts into `releases` table. If scrape fails or upstream calendar absent, fall back to a hardcoded `data/calendar.json` keyed by `series_code` + month/day pattern.

## Alternatives Considered
- **Scrape-only** — Fragile: scrape break → empty calendar.
- **Hardcoded-only** — Drifts every year. Manual updates.
- **Infer from frequency only** — No anchoring to actual release dates; user sees imprecise forecasts.

## Consequences
- **Positive:** real release dates when available, deterministic floor when not.
- **Negative:** scraper code per source. Mitigated by isolating each source as small adapter.

## Trade-offs
Robustness via layered fallback. Manual calendar updates acceptable annually.

## Data model
`releases` table: `(series_code, scheduled_for, source_type='scraped'|'hardcoded'|'inferred', confirmed_at)`. UI can show indicator if event is inferred vs confirmed.
