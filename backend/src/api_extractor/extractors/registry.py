"""Adapter registry: maps Series.source strings to SourceAdapter instances.

Series.source stores human-friendly display names (e.g. "BCB SGS", "IBGE SIDRA",
"Yahoo Finance"). This module normalizes those strings to a canonical slug and
returns the corresponding adapter.

Usage::

    adapter = get_adapter("BCB SGS")  # -> BCBSGSAdapter instance
    result = await adapter.fetch(series, since=None)

Adapter instances are module-level singletons. Each adapter owns its own
httpx.AsyncClient; close them explicitly if needed (lifespan teardown).
"""

from __future__ import annotations

from api_extractor.extractors.anbima_bulk import ANBIMABulkAdapter
from api_extractor.extractors.base import SourceAdapter
from api_extractor.extractors.bcb_sgs import BCBSGSAdapter
from api_extractor.extractors.b3_portal import B3PortalAdapter
from api_extractor.extractors.b3_yahoo import B3YahooAdapter
from api_extractor.extractors.ibge_sidra import IBGESidraAdapter

# Slug normalization: lowercase + strip → canonical key.
#
# Source-string convention in `series.seed.json`:
# - "Yahoo Finance" → b3_yahoo  (Ibovespa, IFIX — via yfinance)
# - "B3"            → b3_portal (IBrX 50/100, ISE, ICO2, IGC family, ITAG —
#                                via unofficial indexStatisticsProxy)
_SOURCE_SLUG_MAP: dict[str, str] = {
    "bcb sgs": "bcb_sgs",
    "bcb_sgs": "bcb_sgs",
    "ibge sidra": "ibge_sidra",
    "ibge_sidra": "ibge_sidra",
    "yahoo finance": "b3_yahoo",
    "yahoo_finance": "b3_yahoo",
    "b3_yahoo": "b3_yahoo",
    "b3": "b3_portal",
    "b3_portal": "b3_portal",
    "anbima": "anbima",
    "anbima ima": "anbima",
}

# Module-level singleton adapters — created once, reused across requests.
_ADAPTERS: dict[str, SourceAdapter] = {
    "bcb_sgs": BCBSGSAdapter(),
    "ibge_sidra": IBGESidraAdapter(),
    "b3_yahoo": B3YahooAdapter(),
    "b3_portal": B3PortalAdapter(),
    "anbima": ANBIMABulkAdapter(),
}


def get_adapter(source: str) -> SourceAdapter:
    """Return the SourceAdapter for the given source display name or slug.

    Args:
        source: Series.source value (e.g. "BCB SGS", "IBGE SIDRA", "Yahoo Finance")
            or an internal slug (e.g. "bcb_sgs").

    Returns:
        The corresponding SourceAdapter instance.

    Raises:
        KeyError: If the source string cannot be mapped to a known adapter.
            This indicates a data integrity issue (Series.source is unexpected).
    """
    slug = _SOURCE_SLUG_MAP.get(source.lower().strip())
    if slug is None:
        raise KeyError(
            f"Unknown source {source!r}. Expected one of: "
            f"{sorted(_SOURCE_SLUG_MAP.keys())}"
        )
    return _ADAPTERS[slug]
