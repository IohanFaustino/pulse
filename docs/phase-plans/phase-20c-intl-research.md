# Phase 20c — Pesquisa: Índices Internacionais + ESG

**Status:** RESEARCH ONLY (não modifica `seed.json` nem código backend).
**Data:** 2026-05-11
**Versão yfinance:** 1.3.0

## Objetivo

Investigar viabilidade de ingestão de 11 índices internacionais (7 acionários + 4 ESG)
via Yahoo Finance / `yfinance`, mapear tickers, identificar proxies, salvar fixtures
representativas e propor classificação no `seed.json`.

## File ownership boundary

Esta rodada cria APENAS:

- `docs/data-sources/intl-indexes.md` (CREATE)
- `backend/tests/fixtures/intl_indexes/*.json` (CREATE — 3 fixtures: S&P 500, Nasdaq Composite, Euro Stoxx 50)
- `docs/phase-plans/phase-20c-intl-research.md` (CREATE — este arquivo)

NÃO modifica:

- `backend/data/series.seed.json`
- Código do adapter `b3_yahoo`
- Migrations Alembic
- Frontend

## Plano (executado)

### Step 1 — Think
Identificados tickers nativos US (`^GSPC`, `^DJI`, `^IXIC`, `^NDX`, `^STOXX50E`).
MSCI / DJSI / FTSE4Good são proprietários — precisam de ETF proxy.

### Step 2 — Plan
Definida lista de candidatos para teste live.

### Step 3 — Execute
Rodado `docker compose exec api python -c "import yfinance ..."` para cada ticker.

| Ticker | Resultado |
|---|---|
| `^GSPC` | OK (24.706 linhas desde 1927-12-30) |
| `^DJI` | OK (8.650 linhas desde 1992-01-02) |
| `^IXIC` | OK (13.932 linhas desde 1971-02-05) |
| `^NDX` | OK (10.231 linhas desde 1985-10-01) |
| `URTH` | OK proxy MSCI World (desde 2012-01-12) |
| `EEM` | OK proxy MSCI EM (desde 2003-04-14) |
| `^STOXX50E` | OK (desde 2007-03-30, EUR) |
| `^SPESG` | OK S&P 500 ESG nativo (desde 2010-04-30) |
| `SNPE` | OK proxy ETF S&P ESG |
| `SUSL` | OK proxy MSCI USA ESG Leaders |
| `ESGD` | OK proxy MSCI EAFE ESG |
| `ESGE` | OK proxy MSCI EM ESG |
| `UKSR.L` | OK parcial — proxy UK ESG (não FTSE4Good) |
| `DJESG` | FAIL — 404 |
| `^FTSE4GOOD` | FAIL — 404 |

### Step 4 — Test
Salvas fixtures: `gspc_30d.json`, `ixic_30d.json`, `stoxx50e_30d.json`
(período `1mo`, schema idêntico a `bvsp_30d.json`).

### Step 5 — Done
Veredito por índice consolidado em `docs/data-sources/intl-indexes.md` §1.

## Veredito final

- **9 de 11 índices viáveis** via Yahoo (4 nativos, 5 proxies ETF).
- **2 indisponíveis:** DJSI World e FTSE4Good (global) — sem cobertura Yahoo,
  sem ETF replicante. Recomendação: **deferir** para fase futura.
- **Surpresa positiva:** `^SPESG` (S&P 500 ESG) está disponível nativamente.

## Próximos passos (fora do escopo desta rodada)

1. Decisão de produto sobre DJSI / FTSE4Good (deferir vs. scraping).
2. Decisão sobre campo `currency` no schema do `seed.json` (EUR e GBp aparecem).
3. Decisão sobre exibição de "proxy via ETF" no frontend.
4. Implementação: estender adapter Yahoo (já existe) — provavelmente reuso direto.
5. Cron diário às 02:00 UTC (~23:00 BRT).
