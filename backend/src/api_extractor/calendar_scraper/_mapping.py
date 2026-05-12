"""Indicator-name → series.code normalization tables.

Source pages name indicators in pt-BR with full long titles (e.g. "Índice
Nacional de Preços ao Consumidor Amplo"). We map them to our seed codes.

Lookup is **case-insensitive** and **accent-insensitive** — see
``normalize_name``. A single source-name can map to 1..N series codes (e.g.
the BCB "Setor Externo" note covers Balanca_Comercial, Reservas_Internacionais,
and Conta_Corrente).
"""

from __future__ import annotations

import unicodedata

# ── Series codes excluded from the calendar per FR-6.7 ────────────────────────
DAILY_SERIES_CODES: frozenset[str] = frozenset(
    {"SELIC", "CDI", "TR", "PTAX_USD", "PTAX_EUR", "Ibovespa", "IFIX"}
)


def normalize_name(name: str) -> str:
    """Lower-case, strip accents, collapse whitespace.

    >>> normalize_name("Índice  Nacional de Preços")
    'indice nacional de precos'
    """
    decomposed = unicodedata.normalize("NFKD", name)
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join(stripped.lower().split())


# Keys MUST already be normalized via ``normalize_name`` for direct lookup.
IBGE_NAME_TO_CODES: dict[str, list[str]] = {
    normalize_name("Índice Nacional de Preços ao Consumidor Amplo"): ["IPCA"],
    normalize_name("Índice Nacional de Preços ao Consumidor Amplo 15"): ["IPCA-15"],
    normalize_name("Índice Nacional de Preços ao Consumidor Amplo - 15"): ["IPCA-15"],
    normalize_name("Índice Nacional de Preços ao Consumidor"): ["INPC"],
    normalize_name("Pesquisa Industrial Mensal: Produção Física - Brasil"): ["Prod_Industrial"],
    normalize_name("Pesquisa Industrial Mensal: Produção Física - Regional"): ["Prod_Industrial"],
    normalize_name("Pesquisa Mensal de Comércio"): ["Vendas_Varejo"],
    normalize_name("Pesquisa Nacional por Amostra de Domicílios Contínua Mensal"): [
        "Desemprego",
        "Massa_Salarial",
    ],
    normalize_name("Pesquisa Nacional por Amostra de Domicílios Contínua Trimestral"): [
        "Desemprego",
        "Massa_Salarial",
    ],
    normalize_name("Sistema de Contas Nacionais Trimestrais"): ["PIB"],
}

BCB_NAME_TO_CODES: dict[str, list[str]] = {
    normalize_name("Estatísticas Monetárias e de Crédito"): ["IBC-Br"],
    normalize_name("Estatísticas do Setor Externo"): [
        "Balanca_Comercial",
        "Reservas_Internacionais",
        "Conta_Corrente",
    ],
    normalize_name("Estatísticas Fiscais"): ["Resultado_Primario", "Divida_Bruta"],
}


def lookup_ibge(indicator_name: str) -> list[str]:
    """Map an IBGE indicator name to its series codes; ``[]`` if unmapped."""
    return list(IBGE_NAME_TO_CODES.get(normalize_name(indicator_name), []))


def lookup_bcb(indicator_name: str) -> list[str]:
    """Map a BCB note name to its series codes; ``[]`` if unmapped."""
    return list(BCB_NAME_TO_CODES.get(normalize_name(indicator_name), []))
