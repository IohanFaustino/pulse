# Índices Internacionais (Stock + ESG) — Data Source Contract

**Library:** [`yfinance`](https://pypi.org/project/yfinance/) (unofficial Yahoo Finance scraper)
**Version validated:** `yfinance>=1.3.0` (mesma versão usada por `b3-yahoo.md`)
**Auth:** none

Este documento cobre 11 índices internacionais (7 acionários + 4 ESG) propostos
para ingestão via Yahoo Finance. Verificação ao vivo em **2026-05-11**.

---

## 1. Symbol mapping (verified live 2026-05-11)

### 1.1 Stock indexes

| Série proposta | Yahoo ticker | Tipo | Status | first_observation | Notas |
|---|---|---|---|---|---|
| `SP500` | `^GSPC` | Índice nativo | OK | 1927-12-30 | Preço em USD. 24.706 trading days. |
| `DJIA` | `^DJI` | Índice nativo | OK | 1992-01-02 | USD. 8.650 trading days no histórico Yahoo. |
| `NASDAQ_COMP` | `^IXIC` | Índice nativo | OK | 1971-02-05 | USD. 13.932 trading days. |
| `NASDAQ_100` | `^NDX` | Índice nativo | OK | 1985-10-01 | USD. 10.231 trading days. |
| `MSCI_WORLD` | `URTH` | **Proxy ETF** | OK | 2012-01-12 | iShares MSCI World ETF — preço em USD, **não é o índice MSCI World oficial**. MSCI é proprietária e não publica o índice no Yahoo. |
| `MSCI_EM` | `EEM` | **Proxy ETF** | OK | 2003-04-14 | iShares MSCI Emerging Markets ETF — USD, proxy. |
| `EURO_STOXX_50` | `^STOXX50E` | Índice nativo | OK | 2007-03-30 | **Cotado em EUR** (não USD). TZ: `Europe/Berlin`. |

### 1.2 ESG indexes

| Série proposta | Yahoo ticker | Tipo | Status | first_observation | Notas |
|---|---|---|---|---|---|
| `SP500_ESG` | `^SPESG` | Índice nativo | OK | 2010-04-30 | S&P 500 ESG Index — disponível direto no Yahoo. USD. |
| `SP500_ESG_ETF` | `SNPE` | Proxy ETF (alt.) | OK | 2019-06-26 | Xtrackers S&P 500 ESG ETF — alternativa tradável. |
| `MSCI_USA_ESG_LEADERS` | `SUSL` | Proxy ETF | OK | 2019-05-10 | iShares ESG MSCI USA Leaders. Sugestão p/ representar família S&P/MSCI ESG. |
| `MSCI_EAFE_ESG` | `ESGD` | Proxy ETF | OK | 2016-08-25 | iShares ESG Aware MSCI EAFE — proxy p/ ESG internacional. |
| `MSCI_EM_ESG` | `ESGE` | Proxy ETF | OK | 2016-07-20 | iShares ESG Aware MSCI EM. |
| `FTSE4GOOD_UK` | `UKSR.L` | Proxy ETF | OK | 2014-10-15 | iShares MSCI UK IMI ESG Leaders (UK ESG, cotado em GBp na LSE). **Não é FTSE4Good puro**. |
| **DJSI World** | — | — | **INDISPONÍVEL** | — | S&P Global não publica DJSI no Yahoo. Sem ETF que replique DJSI World diretamente. Tickers testados: `DJESG` → 404. |
| **FTSE4Good (global)** | — | — | **INDISPONÍVEL** | — | `^FTSE4GOOD` → 404. Yahoo não cobre o índice FTSE4Good. Apenas ETFs UK proxies parciais. |

### 1.3 Tickers testados que falharam

| Candidato | Resultado |
|---|---|
| `DJESG` | 404 — `Quote not found` |
| `^FTSE4GOOD` | 404 — `Quote not found` |
| `FTSE.L` | 404 — `Quote not found` |

---

## 2. Method

Idêntico ao adapter Yahoo já existente (ver `b3-yahoo.md`):

```python
import yfinance as yf
df = yf.Ticker(symbol).history(start=since_date, interval="1d")
value = df["Close"]
```

- TZ varia por ticker:
  - US tickers (`^GSPC`, `^DJI`, `^IXIC`, `^NDX`, ETFs US): `America/New_York` (`-04:00` / `-05:00`)
  - `^STOXX50E`: `Europe/Berlin` (`+02:00` / `+01:00`)
  - `UKSR.L`: `Europe/London` (`+01:00` / `+00:00`)
- Normalização para UTC midnight do trading day, igual contrato `FetchedObservation`.

---

## 3. Update routine

- **Janela de atualização:** após fechamento dos mercados US (~16:00 ET = 21:00 BRT no horário de verão US, ~22:00 BRT no inverno).
- **Job sugerido:** cron diário às **02:00 UTC** (≈ 23:00 BRT) — garante fechamento US + processamento Yahoo concluído.
- **Frequência:** `daily`.
- **Calendário:** segue calendário US (NYSE) para os índices US; calendário Euronext/Eurex para `^STOXX50E`; LSE para `UKSR.L`. Feriados locais devem ser respeitados pelo retorno do Yahoo (dias sem trading não aparecem).

---

## 4. Currency notes

| Ticker | Moeda nativa |
|---|---|
| `^GSPC`, `^DJI`, `^IXIC`, `^NDX`, `^SPESG` | USD (índice em pontos cotado em USD) |
| `URTH`, `EEM`, `SNPE`, `SUSL`, `ESGD`, `ESGE` | USD (ETFs US) |
| `^STOXX50E` | EUR (índice em pontos cotado em EUR) |
| `UKSR.L` | GBp (pence — dividir por 100 p/ GBP) |

**Display rule (proposta, TBD frontend):** exibir valor + sufixo de moeda (`USD`, `EUR`, `GBp`).
Não converter para BRL no backend — exibição é responsabilidade do FE. Flag `currency`
deve compor metadata da série em `seed.json` (não existe ainda — open question).

---

## 5. Known quirks

1. **MSCI World / MSCI EM** — MSCI Inc. é proprietária dos índices; Yahoo não publica
   os valores oficiais. Solução: usar ETFs (`URTH`, `EEM`) como proxy. **Flag `proxy: true`**
   recomendada no seed para diferenciar de índices nativos.

2. **DJSI World** — sem cobertura Yahoo, sem ETF que replique fielmente. Considerar:
   (a) deferir; (b) buscar fonte alternativa (S&P Global website scraping); (c) usar
   `SUSL` como proxy genérico ESG (não é DJSI). **Recomendação: deferir.**

3. **FTSE4Good** — idem DJSI: o índice global não está no Yahoo. `UKSR.L` cobre só UK
   e tracking de MSCI, não FTSE. **Recomendação: deferir** ou documentar como
   "não coberto na Phase 20c".

4. **`^STOXX50E` em EUR** — primeiro índice não-USD do projeto. Garante consistência
   da modelagem de currency na metadata.

5. **Volume sintético** — ETFs têm volume real, mas índices puros (`^GSPC` etc.)
   têm `Volume` agregado/sintético do Yahoo (não significativo). Ignorar — usar só `Close`.

6. **Histórico longo** — `^GSPC` retorna ~24k linhas (1927+). Para backfill inicial,
   limitar a `start='2000-01-01'` para evitar payloads gigantes. Configurável por série.

---

## 6. Classification proposal (para seed.json — NÃO aplicar nesta rodada)

### 6.1 Nova categoria sugerida

- **`Mercado Internacional`** — para os 7 índices acionários (S&P 500, DJIA, Nasdaq Composite,
  Nasdaq 100, MSCI World proxy, MSCI EM proxy, Euro Stoxx 50).
- **`Sustentabilidade`** (ou alternativamente `ESG`) — para os 4 índices ESG cobertos
  (S&P 500 ESG, MSCI USA ESG Leaders proxy, MSCI EAFE ESG proxy, MSCI EM ESG proxy).
  DJSI e FTSE4Good ficam fora desta entrega.

### 6.2 Atributos comuns

| Campo | Valor proposto |
|---|---|
| `frequency` | `daily` |
| `source` | `Yahoo Finance` |
| `unit` | `pontos` para índices nativos; `USD` (ou moeda nativa) para ETF proxies |
| `proxy` | `true` para tickers de ETF; `false` para `^GSPC`, `^DJI`, etc. |
| `currency` | `USD` / `EUR` / `GBp` conforme ticker |

### 6.3 Lista consolidada (proposta)

| code | name | category | ticker | unit | currency | proxy | first_obs |
|---|---|---|---|---|---|---|---|
| `SP500` | S&P 500 | Mercado Internacional | `^GSPC` | pontos | USD | false | 1927-12-30 |
| `DJIA` | Dow Jones Industrial Average | Mercado Internacional | `^DJI` | pontos | USD | false | 1992-01-02 |
| `NASDAQ_COMP` | Nasdaq Composite | Mercado Internacional | `^IXIC` | pontos | USD | false | 1971-02-05 |
| `NASDAQ_100` | Nasdaq 100 | Mercado Internacional | `^NDX` | pontos | USD | false | 1985-10-01 |
| `MSCI_WORLD` | MSCI World (via URTH) | Mercado Internacional | `URTH` | USD | USD | true | 2012-01-12 |
| `MSCI_EM` | MSCI Emerging Markets (via EEM) | Mercado Internacional | `EEM` | USD | USD | true | 2003-04-14 |
| `EURO_STOXX_50` | Euro Stoxx 50 | Mercado Internacional | `^STOXX50E` | pontos | EUR | false | 2007-03-30 |
| `SP500_ESG` | S&P 500 ESG | Sustentabilidade | `^SPESG` | pontos | USD | false | 2010-04-30 |
| `MSCI_USA_ESG_LEADERS` | MSCI USA ESG Leaders (via SUSL) | Sustentabilidade | `SUSL` | USD | USD | true | 2019-05-10 |
| `MSCI_EAFE_ESG` | MSCI EAFE ESG (via ESGD) | Sustentabilidade | `ESGD` | USD | USD | true | 2016-08-25 |
| `MSCI_EM_ESG` | MSCI EM ESG (via ESGE) | Sustentabilidade | `ESGE` | USD | USD | true | 2016-07-20 |

---

## 7. Open questions

1. **MSCI World/EM oficial** — buscar fonte alternativa (MSCI API paga, scraping
   msci.com) ou aceitar proxy ETF como definitivo? Recomendação: aceitar proxy,
   documentar.
2. **DJSI** — deferir (recomendado) ou tentar scraping S&P Global?
3. **FTSE4Good** — idem DJSI. Sem cobertura confiável.
4. **Currency no schema** — `series.seed.json` não tem campo `currency` hoje.
   Precisa ser adicionado para suportar EUR/GBp? Ou armazenar tudo em pontos e
   delegar à UI?
5. **Display em BRL** — opcional? Se sim, requer cruzar com USDBRL/EURBRL diários
   (já temos `USDBRL` via Yahoo Finance? — checar).
6. **Histórico inicial** — backfill desde `2000-01-01` ou desde `first_observation`
   de cada ticker? Para `^GSPC` (1927+), capar para evitar 24k linhas.
7. **Field `proxy: true` no seed** — frontend precisa mostrar badge "proxy via ETF"?

---

## 8. Fixtures

Salvas em `backend/tests/fixtures/intl_indexes/`:

- `gspc_30d.json` — S&P 500, 21 trading days (período `1mo`)
- `ixic_30d.json` — Nasdaq Composite, 21 trading days
- `stoxx50e_30d.json` — Euro Stoxx 50, 20 trading days (EUR, TZ Europe/Berlin)

## Implementação (Wave B-3)

O adapter `B3YahooAdapter` (`backend/src/api_extractor/extractors/b3_yahoo.py`)
é totalmente *series-driven*: lê `series.source_id` e o passa direto para
`yfinance.Ticker`. Nenhuma das 8 séries internacionais exigiu código novo —
apenas o seed em `data/series.seed.json` (Wave A) e os testes de regressão.

### Correção de fuso horário

A versão anterior de `_to_utc_midnight` convertia toda timestamp tz-aware para
`America/Sao_Paulo` antes de extrair a data. Isso causava drift de um dia em
mercados a leste de UTC: uma barra `^STOXX50E` ancorada em
`2026-04-13T00:00:00+02:00` vira `2026-04-12T19:00` em São Paulo e seria
gravada como observação de 2026-04-12 — um dia antes do pregão real.

Correção (Wave B-3): para timestamps tz-aware, usa-se diretamente
`ts.date()` na timezone original (que é a convenção do yfinance: meia-noite
local do dia de pregão). Para timestamps naive, usa-se a data como está.
Em ambos os casos, ancora-se em UTC 00:00.

Validado por `test_parse_fixture_euro_stoxx_trading_day_preserved` (compara
o conjunto de dias de pregão da fixture com o conjunto observado pós-parse).

### Currency é metadado de série

`FetchedObservation` carrega apenas `series_code`, `observed_at` e `value`.
A moeda (`USD` / `EUR`) vive em `Series.currency` e é consultada via
metadados quando a UI ou um transform precisa exibir/converter valores.
Validado por `test_currency_field_not_attached_to_observations`.

### Proxies ETF

`MSCI_World` (URTH) e `MSCI_EM` (EEM) são proxies via ETF. O adapter retorna
o preço do ETF *as-is*, sem tentar reconstruir o índice subjacente —
qualquer normalização (rebase, escala) é responsabilidade do consumidor a
jusante. Validado por `test_proxy_etf_returns_etf_values`.

### Smoke ao vivo (2026-05-11)

`POST /admin/extract/{code}?since=2026-04-01`:

| code           | obs desde 2026-04-01 |
| -------------- | -------------------- |
| SP500          | 27                   |
| Euro_Stoxx_50  | 25                   |
| MSCI_World     | 27                   |
