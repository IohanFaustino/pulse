# Series catalog (72)

Series are clustered by **theme** and within each theme sorted by **source**.

## Inflação — 5 series

| Source | Code | Frequency |
|---|---|---|
| BCB SGS | IGP-DI | monthly |
| BCB SGS | IGP-M | monthly |
| BCB SGS | INPC | monthly |
| BCB SGS | IPCA | monthly |
| BCB SGS | IPCA-15 | monthly |

## Juros — 4 series

| Source | Code | Frequency |
|---|---|---|
| BCB SGS | CDI | daily |
| BCB SGS | SELIC | daily |
| BCB SGS | SELIC_meta | event |
| BCB SGS | TR | daily |

## Câmbio — 2 series

| Source | Code | Frequency |
|---|---|---|
| BCB SGS | PTAX_EUR | daily |
| BCB SGS | PTAX_USD | daily |

## Atividade — 5 series

| Source | Code | Frequency |
|---|---|---|
| BCB SGS | IBC-Br | monthly |
| IBGE SIDRA | PIB_Nominal | quarterly |
| IBGE SIDRA | PIB_Real | quarterly |
| IBGE SIDRA | Prod_Industrial | monthly |
| IBGE SIDRA | Vendas_Varejo | monthly |

## Trabalho — 3 series

| Source | Code | Frequency |
|---|---|---|
| BCB SGS | CAGED | monthly |
| IBGE SIDRA | Desemprego | quarterly |
| IBGE SIDRA | Rendimento_Medio | quarterly |

## Fiscal — 2 series

| Source | Code | Frequency |
|---|---|---|
| BCB SGS | Divida_Bruta | monthly |
| BCB SGS | Resultado_Primario | monthly |

## Externo — 3 series

| Source | Code | Frequency |
|---|---|---|
| BCB SGS | Balanca_Comercial | monthly |
| BCB SGS | Conta_Corrente | monthly |
| BCB SGS | Reservas_Internacionais | monthly |

## Mercado (Brasil) — 4 series

| Source | Code | Frequency |
|---|---|---|
| B3 portal | IBrX_50 | daily |
| B3 portal | IBrX_100 | daily |
| Yahoo Finance | Ibovespa (^BVSP) | daily |
| Yahoo Finance | IFIX (XFIX11.SA proxy) | daily |

## Mercado Internacional — 7 series

| Source | Code | Frequency |
|---|---|---|
| Yahoo Finance | DJIA (^DJI, USD) | daily |
| Yahoo Finance | Euro_Stoxx_50 (^STOXX50E, EUR) | daily |
| Yahoo Finance | MSCI_EM (EEM proxy, USD) | daily |
| Yahoo Finance | MSCI_World (URTH proxy, USD) | daily |
| Yahoo Finance | Nasdaq_100 (^NDX, USD) | daily |
| Yahoo Finance | Nasdaq_Composite (^IXIC, USD) | daily |
| Yahoo Finance | SP500 (^GSPC, USD) | daily |

## Governança — 4 series

| Source | Code | Frequency |
|---|---|---|
| B3 portal | IGCT_B3 | daily |
| B3 portal | IGC_B3 | daily |
| B3 portal | IGC_NM_B3 | daily |
| B3 portal | ITAG_B3 | daily |

## Sustentabilidade — 3 series

| Source | Code | Frequency |
|---|---|---|
| B3 portal | ICO2_B3 | daily |
| B3 portal | ISE_B3 | daily |
| Yahoo Finance | SP500_ESG (^SPESG, USD) | daily |

## Multimercado — 1 series

| Source | Code | Frequency |
|---|---|---|
| ANBIMA | IHFA (Hedge Funds) | daily |

## Renda Fixa (ANBIMA) — 29 series

All daily, source = ANBIMA (bulk XLSX from `data.anbima.com.br`).

| Family | Codes |
|---|---|
| **IMA** | IMA-Geral · IMA-Geral_ex-C · IMA-S |
| **IMA-B** (IPCA-linked) | IMA-B · IMA-B_5 · IMA-B_5plus · IMA-B_5_P2 |
| **IRF-M** (prefixed) | IRF-M · IRF-M_1 · IRF-M_1plus · IRF-M_P2 · IRF-M_P3 |
| **IDA** (debêntures) | IDA_Geral · IDA_DI · IDA_IPCA · IDA_IPCA_Infra · IDA_IPCA_ExInfra · IDA_Liq_Geral · IDA_Liq_DI · IDA_Liq_IPCA · IDA_Liq_IPCA_Infra |
| **IDKA** (constant duration) | IDKA_PRE_3M · IDKA_PRE_1A · IDKA_PRE_2A · IDKA_PRE_3A · IDKA_PRE_5A · IDKA_IPCA_2A · IDKA_IPCA_3A · IDKA_IPCA_5A |

## Source totals

| Source | # series | Notes |
|---|---|---|
| **ANBIMA** | 30 | Bulk XLSX from S3 (`data.anbima.com.br`) — full history per file |
| **BCB SGS** | 24 | Per-date JSON, 10-year window cap → chunked |
| **Yahoo Finance** | 10 | yfinance 1.3.0; ETF proxies for IFIX, MSCI_World, MSCI_EM |
| **B3 portal** | 8 | `sistemaswebb3-listados.b3.com.br` JSON proxy (no auth) |
| **IBGE SIDRA** | 5 | Variable + classification map (`IBGE_VARIABLE_MAP`) |
| **Total** | **72** | 4 migrations · 12 categories |
