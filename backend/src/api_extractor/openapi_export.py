"""OpenAPI schema export CLI.

Exports the FastAPI-generated OpenAPI 3.x schema to stdout (or a file)
without starting a live server. Import the app and use FastAPI's built-in
``app.openapi()`` method to get the full schema dict.

Usage::

    # Print to stdout (pipe to file):
    python -m api_extractor.openapi_export > backend/openapi.json

    # Or run as a module directly:
    cd backend && python -m api_extractor.openapi_export

The output is valid OpenAPI 3.x JSON compatible with openapi-typescript codegen.
"""

from __future__ import annotations

import json
import sys


def main() -> None:
    """Generate and print the OpenAPI schema to stdout."""
    # Import app here (not at module level) so that the lifespan context
    # does NOT run — we only need the schema dict, not a live server.
    from api_extractor.main import app  # noqa: PLC0415

    schema = app.openapi()
    json.dump(schema, sys.stdout, indent=2, ensure_ascii=False)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
