"""IBGE SIDRA adapter — pulls observations for IBGE-sourced series.

Implements the `SourceAdapter` contract (see `base.py`) against
`https://apisidra.ibge.gov.br/values`.

Design notes:
- Each series has a known (table, variable, classification) tuple recorded in
  `IBGE_VARIABLE_MAP`. The `Series.source_id` (table id) is informational; the
  adapter trusts the map for variable + classification because SIDRA tables
  routinely expose multiple variables and SIDRA `/v/all/` returns rows that
  cannot be safely picked without explicit selection.
- Response always starts with a metadata header row (field code -> pt-BR
  label). We skip it.
- Value field "V" arrives as a string with a dot decimal separator; missing
  values are encoded as "..", "...", "-", or "x" — all skipped.
- Period dimension may be `D2C` or `D3C` depending on table layout; we resolve
  it from the header by inspecting which label contains "Mês"/"Trimestre".
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Final

import httpx
from loguru import logger
from tenacity import (
    AsyncRetrying,
    RetryError,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from api_extractor.extractors.base import (
    ExtractionError,
    ExtractionResult,
    FetchedObservation,
    SourceAdapter,
)
from api_extractor.models.series import Series

# ── Constants ────────────────────────────────────────────────────────────────

SIDRA_BASE_URL: Final[str] = "https://apisidra.ibge.gov.br/values"
HTTP_TIMEOUT_SECONDS: Final[float] = 30.0
MISSING_VALUE_TOKENS: Final[frozenset[str]] = frozenset({"..", "...", "-", "x", ""})

QUARTER_TO_MONTH: Final[dict[str, int]] = {
    "01": 1,
    "02": 4,
    "03": 7,
    "04": 10,
}


@dataclass(frozen=True, slots=True)
class _SidraSpec:
    """Per-series SIDRA query specification."""

    table: str
    variable: str
    classification: tuple[str, str] | None  # (class_id, cat_id) or None
    frequency: str  # "monthly" | "quarterly"


# Verified during W2 research. See docs/data-sources/ibge-sidra.md for source URLs.
IBGE_VARIABLE_MAP: Final[dict[str, _SidraSpec]] = {
    # PIB level series — replace prior % growth.
    # 1846 var 585 = "Valores a preços correntes" (nominal R$ mi).
    # 1620 var 583 = "Série encadeada do índice de volume" (real, base 1995=100).
    "PIB_Nominal": _SidraSpec(
        table="1846", variable="585", classification=("11255", "90707"),
        frequency="quarterly",
    ),
    "PIB_Real": _SidraSpec(
        # 6612 var 9318 = "Valores encadeados a preços de 1995" — real PIB
        # expressed in R$ mi (volume measured at constant 1995 prices), NOT
        # an index. Replaces prior 1620/var 583 which was a number-index.
        table="6612", variable="9318", classification=("11255", "90707"),
        frequency="quarterly",
    ),
    "Prod_Industrial": _SidraSpec(
        table="8888", variable="12606", classification=("544", "129314"),
        frequency="monthly",
    ),
    "Vendas_Varejo": _SidraSpec(
        # c11046/56736 = "Índice de volume de vendas no comércio varejista ampliado"
        # (56734 returns all suppressed "..."; 56735 is receita nominal — wrong unit)
        table="8881", variable="7170", classification=("11046", "56736"),
        frequency="monthly",
    ),
    "Desemprego": _SidraSpec(
        table="4099", variable="4099", classification=None,
        frequency="quarterly",
    ),
    "Massa_Salarial": _SidraSpec(
        table="6390", variable="5933", classification=None,
        frequency="monthly",
    ),
    # PNAD Contínua "Rendimento médio mensal real" (R$/pessoa). Same table
    # and variable as Massa_Salarial — both are extracted from variable 5933
    # of table 6390. Period codes are trimestre móvel (e.g. 202603 = jan-fev-
    # mar 2026) and step monthly, so we parse them as monthly.
    "Rendimento_Medio": _SidraSpec(
        table="6390", variable="5933", classification=None,
        frequency="monthly",
    ),
}


# ── Period parsing ───────────────────────────────────────────────────────────


def parse_period_monthly(code: str) -> datetime:
    """Parse "YYYYMM" → first-of-month at 00:00 UTC."""
    if len(code) != 6 or not code.isdigit():
        raise ValueError(f"Invalid monthly period code: {code!r}")
    year = int(code[:4])
    month = int(code[4:])
    if not 1 <= month <= 12:
        raise ValueError(f"Month out of range in period code: {code!r}")
    return datetime(year, month, 1, tzinfo=UTC)


def parse_period_quarterly(code: str) -> datetime:
    """Parse "YYYYQQ" with QQ∈{01..04} → first day of [Jan,Apr,Jul,Oct] UTC."""
    if len(code) != 6 or not code.isdigit():
        raise ValueError(f"Invalid quarterly period code: {code!r}")
    year = int(code[:4])
    quarter = code[4:]
    if quarter not in QUARTER_TO_MONTH:
        raise ValueError(f"Quarter out of range in period code: {code!r}")
    return datetime(year, QUARTER_TO_MONTH[quarter], 1, tzinfo=UTC)


# ── Adapter ──────────────────────────────────────────────────────────────────


class IBGESidraAdapter(SourceAdapter):
    """Adapter for IBGE SIDRA aggregated tables."""

    source: str = "ibge_sidra"

    def __init__(self, client: httpx.AsyncClient | None = None) -> None:
        self._client = client
        self._owns_client = client is None

    # ── URL building ─────────────────────────────────────────────────────────

    @staticmethod
    def build_url(spec: _SidraSpec, period: str = "all") -> str:
        """Build the SIDRA `/values/...` URL for a series spec.

        Args:
            spec: Per-series query specification.
            period: SIDRA period segment. ``"all"`` returns full history;
                otherwise expects ``YYYYMM``/``YYYYQQ`` or a range/list.
        """
        parts = [
            SIDRA_BASE_URL,
            "t", spec.table,
            "n1", "all",
            "v", spec.variable,
            "p", period,
        ]
        if spec.classification is not None:
            class_id, cat_id = spec.classification
            parts.extend([f"c{class_id}", cat_id])
        return "/".join(parts)

    # ── Parsing ──────────────────────────────────────────────────────────────

    @staticmethod
    def _resolve_period_key(header: dict[str, Any]) -> str:
        """Pick the dimension column (D2C/D3C/…) that carries the period code."""
        for key, label in header.items():
            if not isinstance(label, str):
                continue
            if not (key.startswith("D") and key.endswith("C")):
                continue
            low = label.lower()
            if "mês" in low or "trimestre" in low:
                return key
        raise ExtractionError(
            "ibge_sidra",
            "<unknown>",
            f"Could not locate period dimension in SIDRA header: {header!r}",
        )

    def _parse_payload(
        self,
        payload: list[dict[str, Any]],
        series_code: str,
        spec: _SidraSpec,
    ) -> list[FetchedObservation]:
        """Convert a SIDRA JSON array into normalized observations."""
        if not payload:
            return []

        header = payload[0]
        rows = payload[1:]
        if not rows:
            return []

        period_key = self._resolve_period_key(header)
        period_parser = (
            parse_period_quarterly
            if spec.frequency == "quarterly"
            else parse_period_monthly
        )

        observations: list[FetchedObservation] = []
        for row in rows:
            raw_value = row.get("V")
            if not isinstance(raw_value, str) or raw_value.strip() in MISSING_VALUE_TOKENS:
                continue
            try:
                value = Decimal(raw_value.strip())
            except (InvalidOperation, ValueError):
                logger.warning(
                    "ibge_sidra: skipping unparseable value",
                    series_code=series_code,
                    value=raw_value,
                )
                continue

            period_code = row.get(period_key)
            if not isinstance(period_code, str):
                continue
            try:
                observed_at = period_parser(period_code)
            except ValueError as exc:
                logger.warning(
                    "ibge_sidra: skipping invalid period",
                    series_code=series_code,
                    period=period_code,
                    error=str(exc),
                )
                continue

            observations.append(
                FetchedObservation(
                    series_code=series_code,
                    observed_at=observed_at,
                    value=value,
                )
            )

        observations.sort(key=lambda o: o.observed_at)
        return observations

    # ── Period segment for since ─────────────────────────────────────────────

    @staticmethod
    def _period_segment(spec: _SidraSpec, since: date | None) -> str:
        if since is None:
            return "all"
        if spec.frequency == "quarterly":
            quarter = (since.month - 1) // 3 + 1
            return f"{since.year}{quarter:02d}-{since.year + 50}04"
        # monthly (incl. trimestre móvel)
        return f"{since.year}{since.month:02d}-{since.year + 50}12"

    # ── Fetch ────────────────────────────────────────────────────────────────

    async def fetch(
        self,
        series: Series,
        since: date | None = None,
    ) -> ExtractionResult:
        """Fetch observations for ``series`` from SIDRA.

        Raises:
            ExtractionError: when the series has no entry in ``IBGE_VARIABLE_MAP``
                or when network calls fail after retries.
        """
        spec = IBGE_VARIABLE_MAP.get(series.code)
        if spec is None:
            raise ExtractionError(
                self.source,
                series.code,
                f"No IBGE_VARIABLE_MAP entry for series code {series.code!r}",
            )

        period = self._period_segment(spec, since)
        url = self.build_url(spec, period=period)
        logger.info("ibge_sidra: fetching", series_code=series.code, url=url)

        try:
            payload = await self._get_with_retry(url, series.code)
        except RetryError as exc:
            cause = exc.last_attempt.exception() if exc.last_attempt else exc
            raise ExtractionError(
                self.source,
                series.code,
                f"HTTP retries exhausted: {cause!r}",
            ) from exc
        except httpx.HTTPError as exc:
            # tenacity reraise=True surfaces the underlying exception directly.
            raise ExtractionError(
                self.source,
                series.code,
                f"HTTP retries exhausted: {exc!r}",
            ) from exc

        observations = self._parse_payload(payload, series.code, spec)
        return ExtractionResult(
            series_code=series.code,
            observations=observations,
            fetched_at=datetime.now(tz=UTC),
            source=self.source,
        )

    async def _get_with_retry(
        self,
        url: str,
        series_code: str,
    ) -> list[dict[str, Any]]:
        """GET ``url`` with tenacity 3x exponential backoff (2/8/30s)."""
        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_exponential(multiplier=2, min=2, max=30),
            retry=retry_if_exception_type(
                (httpx.HTTPError, httpx.TimeoutException)
            ),
            reraise=True,
        ):
            with attempt:
                logger.debug(
                    "ibge_sidra: attempt",
                    series_code=series_code,
                    attempt=attempt.retry_state.attempt_number,
                )
                client = self._client or httpx.AsyncClient(timeout=HTTP_TIMEOUT_SECONDS)
                try:
                    response = await client.get(url)
                    response.raise_for_status()
                    payload = response.json()
                finally:
                    if self._owns_client:
                        await client.aclose()
                if not isinstance(payload, list):
                    raise httpx.HTTPError(
                        f"Unexpected SIDRA payload type: {type(payload).__name__}"
                    )
                return payload
        # Should be unreachable because reraise=True surfaces the last error.
        raise ExtractionError(
            self.source, series_code, "Retry loop exited without result"
        )
