"""Tests for the OpenAPI schema correctness and completeness."""

from __future__ import annotations

import pytest

from tests.fixtures_api import api_client  # noqa: F401

EXPECTED_PATHS = {
    "/health",
    "/series",
    "/series/{code}",
    "/series/{code}/observations",
    "/series/{code}/transform",
    "/releases",
    "/user_prefs",
    "/admin/extract/{code}",
}


@pytest.fixture()
def openapi_schema():
    """Return the OpenAPI schema dict directly from the app."""
    from api_extractor.main import app
    return app.openapi()


def test_openapi_schema_is_dict(openapi_schema):
    assert isinstance(openapi_schema, dict)
    assert openapi_schema


def test_openapi_schema_version(openapi_schema):
    assert "openapi" in openapi_schema
    assert openapi_schema["openapi"].startswith("3.")


def test_openapi_schema_info(openapi_schema):
    info = openapi_schema.get("info", {})
    assert info.get("title")
    assert info.get("version")


def test_openapi_schema_has_all_paths(openapi_schema):
    paths = set(openapi_schema.get("paths", {}).keys())
    missing = EXPECTED_PATHS - paths
    assert not missing, f"Missing paths from OpenAPI schema: {missing}"


def test_openapi_schema_no_extra_unexpected_paths(openapi_schema):
    paths = set(openapi_schema.get("paths", {}).keys())
    for path in paths:
        assert any(
            path == expected
            or path.startswith("/admin")
            or path.startswith("/series")
            or path.startswith("/health")
            or path.startswith("/releases")
            or path.startswith("/user_prefs")
            for expected in EXPECTED_PATHS
        ), f"Unexpected path in schema: {path}"


def test_every_route_has_summary(openapi_schema):
    paths = openapi_schema.get("paths", {})
    for path, path_item in paths.items():
        for method, operation in path_item.items():
            if method in {"get", "post", "put", "patch", "delete"}:
                summary = operation.get("summary", "").strip()
                assert summary, f"Missing summary on {method.upper()} {path}."


def test_every_route_has_tags(openapi_schema):
    paths = openapi_schema.get("paths", {})
    for path, path_item in paths.items():
        for method, operation in path_item.items():
            if method in {"get", "post", "put", "patch", "delete"}:
                tags = operation.get("tags", [])
                assert tags, f"Missing tags on {method.upper()} {path}."


def test_every_route_has_response_schema(openapi_schema):
    paths = openapi_schema.get("paths", {})
    for path, path_item in paths.items():
        for method, operation in path_item.items():
            if method in {"get", "post", "put", "patch", "delete"}:
                responses = operation.get("responses", {})
                assert responses, f"No responses on {method.upper()} {path}."
                has_success = any(str(k).startswith("2") for k in responses.keys())
                assert has_success, f"No 2xx response on {method.upper()} {path}."


def test_openapi_schema_has_components(openapi_schema):
    assert "components" in openapi_schema
    schemas = openapi_schema["components"].get("schemas", {})
    assert schemas, "No component schemas defined."


def test_openapi_schema_key_models_present(openapi_schema):
    schemas = openapi_schema.get("components", {}).get("schemas", {})
    expected_models = {
        "HealthResponse",
        "SeriesListResponse",
        "SeriesRead",
        "ObservationListResponse",
        "TransformResponse",
        "ReleaseListResponse",
        "UserPrefsRead",
        "ExtractionResultResponse",
    }
    missing = expected_models - set(schemas.keys())
    assert not missing, f"Missing component schemas: {missing}"


@pytest.mark.asyncio
async def test_get_openapi_json_via_http(api_client):
    """GET /openapi.json must return the schema via HTTP."""
    resp = await api_client.get("/openapi.json")
    assert resp.status_code == 200
    data = resp.json()
    assert "openapi" in data
    assert "paths" in data
