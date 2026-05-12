# Calendar sources — IBGE + BCB

**Phase:** 6  **ADR:** [0008](../adr/0008-calendar-scrape-with-fallback.md)

Two scrapers + one hardcoded fallback feed the `releases` table. Daily-frequency
series are excluded per FR-6.7.

---

## IBGE — Calendário Mensal de Divulgações

| Aspect | Value |
|---|---|
| URL | `https://www.ibge.gov.br/calendario/mensal.html` |
| Optional query | `?mes={1..12}&ano={YYYY}` (defaults to current month) |
| Format | HTML (static, server-rendered) |
| Auth | none |
| Cadence | annual publication, monthly view |
| User-Agent gate | not enforced (curl with default UA succeeds; we send `Mozilla/5.0`) |
| Rate limit | none observed; we throttle to 1 request per month-view |

### Parsing strategy

Each release is a sibling pair of div blocks:

```html
<div class="agenda--lista__data">
  <span data-divulgacao="2026-05-12 09:00:00-03:00">12/05/2026</span>
</div>
<div class="agenda--lista__evento">
  <p><a href=".../9258-indice-nacional-de-precos-ao-consumidor.html"
        data-produto-id='9258'>
     Índice Nacional de Preços ao Consumidor
  </a></p>
</div>
```

Use `BeautifulSoup`:
- Prefer `data-divulgacao` ISO attribute on `<span>` (timezone-aware); fall back
  to text `12/05/2026`.
- Indicator name = anchor text inside `.agenda--lista__evento p a`.
- `data-produto-id` is a stable IBGE numeric id — useful for unambiguous mapping.

### Sample captured releases (2026-05)

| Date | IBGE indicator | data-produto-id |
|---|---|---|
| 12/05/2026 | Índice Nacional de Preços ao Consumidor | 9258 |
| 12/05/2026 | Índice Nacional de Preços ao Consumidor Amplo | 9256 |
| 13/05/2026 | Pesquisa Mensal de Comércio | 9227 |
| 14/05/2026 | Pesquisa Nacional por Amostra de Domicílios Contínua Trimestral | 9173 |
| 15/05/2026 | Pesquisa Mensal de Serviços | (—) |
| 29/05/2026 | Sistema de Contas Nacionais Trimestrais | (—) |

---

## BCB — Calendário de divulgação Notas econômico-financeiras

| Aspect | Value |
|---|---|
| URL | `https://www.bcb.gov.br/content/estatisticas/Lists/calendario-notas-economico-financeiras/AllItems.aspx` |
| Format | HTML (SharePoint List view) |
| Auth | none, but tight UA/referer filtering — plain curl yields a 502/blocked page |
| Cadence | weekly refresh by BCB; we poll weekly |
| Rate limit | unknown; conservative single request per refresh |

### Parsing strategy

SharePoint list renders one `<tr>` per release inside the main list table
(`id="onetidDoclibViewTbl0"` or `class="ms-listviewtable"`). Cells:

| Position | Content |
|---|---|
| 1st `td.ms-vb2` | Date in `dd/mm/yyyy` |
| 2nd `td.ms-vb-title` (or similar) | Indicator name in `<a>` |
| 3rd cell | Reference period (`Abril/2026`) — ignored |

Captured response (`bcb.html`) shows the page is blocked from our network; we
keep the raw response on disk for failure-mode parity, and use
`bcb_sample.html` as a structural fixture for parser tests. **Operational
behaviour:** when the live fetch fails or yields no rows, the scraper raises
`CalendarScrapeError` and the orchestrator falls back to hardcoded data for the
BCB-covered series.

### BCB indicator → series.code mapping

Only three BCB "notes" map directly to seed series. Other seed series sourced
from BCB SGS (IPCA-derived, SELIC, PTAX, etc.) are NOT in this calendar — they
are continuous-daily or published via separate notas/COPOM.

| BCB note (page) | series.code | Comment |
|---|---|---|
| Estatísticas Monetárias e de Crédito | IBC-Br | only loose proxy — IBC-Br is a monthly note from BCB DEPEC, often released same week. Keep as approximate. |
| Estatísticas do Setor Externo | Balanca_Comercial, Reservas_Internacionais, Conta_Corrente | one note covers multiple series; emit one row per code |
| Estatísticas Fiscais | Resultado_Primario, Divida_Bruta | one note covers both |

---

## Hardcoded fallback — `backend/data/calendar.json`

Layout: array of objects.

```json
[
  {"series_code": "IPCA", "scheduled_for": "2026-05-12"},
  {"series_code": "PIB",  "scheduled_for": "2026-05-29"}
]
```

Constraints:
- `series_code` must reference a seed series (FK enforced at upsert).
- `scheduled_for` must be ISO-8601 `YYYY-MM-DD`.
- Daily series MUST NOT appear (FR-6.7). Validated by test.

Seeded with ~12 months of plausible release dates per non-daily series based on
historic IBGE/BCB cadence (≈ 5th–12th business day of each month for IBGE
indicators; ≈ end-of-month for IBGE PNAD; mid-month for BCB notes; PIB
quarterly ≈ last week of Feb/May/Aug/Nov).

---

## Indicator-name → series.code normalization

Lives in `calendar_scraper/_mapping.py` as two dicts:

```python
IBGE_NAME_TO_CODES: dict[str, list[str]]   # title → list of series.code
BCB_NAME_TO_CODES:  dict[str, list[str]]
```

Lists support 1:N (e.g., a single Setor Externo note covers 3 series).

### IBGE name canonicalization

Lookup is case-insensitive, accent-insensitive, stripped of trailing whitespace.

| IBGE indicator | series.code(s) |
|---|---|
| Índice Nacional de Preços ao Consumidor Amplo | IPCA |
| Índice Nacional de Preços ao Consumidor Amplo 15 | IPCA-15 |
| Índice Nacional de Preços ao Consumidor | INPC |
| Pesquisa Industrial Mensal: Produção Física - Brasil | Prod_Industrial |
| Pesquisa Industrial Mensal: Produção Física - Regional | Prod_Industrial |
| Pesquisa Mensal de Comércio | Vendas_Varejo |
| Pesquisa Nacional por Amostra de Domicílios Contínua Mensal | Desemprego, Massa_Salarial |
| Pesquisa Nacional por Amostra de Domicílios Contínua Trimestral | Desemprego, Massa_Salarial |
| Sistema de Contas Nacionais Trimestrais | PIB |

### Ambiguities / quirks

- **PNAD Mensal vs Trimestral:** IBGE publishes both views of the same survey. We map both to Desemprego + Massa_Salarial — the monthly is most current.
- **IPCA vs IPCA-15:** IBGE titles are very similar; suffix "15" distinguishes.
- **PIM-PF Brasil vs Regional:** typically same date; mapping both to Prod_Industrial means two entries on that date — collapsed by repo upsert primary key `(series_code, scheduled_for)`.
- **IGP-M, IGP-DI:** published by FGV, NOT IBGE. They do not appear in IBGE calendar. Hardcoded only (1st/30th of month approximately).
- **SELIC_meta:** COPOM meeting dates published in BCB's separate COPOM calendar (not in the SharePoint notes list). Hardcoded approximations only (8 meetings/year).
- **IBC-Br:** released by BCB but not in the notas SharePoint list; mid-month approximate.

### Open questions

1. Should we add a third scraper for **COPOM meeting calendar** (`https://www.bcb.gov.br/publicacoes/calendarioreunioescopom`) to populate SELIC_meta? Deferred — hardcoded for v1.
2. The FGV indices (IGP-M, IGP-DI) — should we scrape FGV's portal? FGV requires login. Hardcoded only.
3. CAGED is from Ministério do Trabalho (PDET), not BCB. Hardcoded approx.

---

## Failure modes & telemetry

| Mode | Behaviour |
|---|---|
| 5xx, 4xx, network error | log WARN → raise `CalendarScrapeError` → orchestrator falls back to hardcoded slice for that source |
| HTML loaded but no entries parsed | same as above |
| Unmappable indicator name | log INFO + skip; do NOT poison the run |
| Daily series leaked into hardcoded | unit test `test_daily_series_excluded` blocks merge |
