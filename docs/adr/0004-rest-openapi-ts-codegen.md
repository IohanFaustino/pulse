# ADR-0004: REST + OpenAPI with TS client codegen

## Status
Accepted — 2026-05-11

## Context
Frontend (Vite + React + TS) needs typed access to backend. FastAPI auto-generates OpenAPI schema from Pydantic models.

## Decision
REST endpoints with Pydantic v2 models. Generate TS types via `openapi-typescript` consumed by a thin fetch wrapper. No tRPC, no GraphQL.

## Alternatives Considered
- **tRPC** — End-to-end types but requires shared codebase or codegen pipeline; FastAPI is not native tRPC.
- **GraphQL** — Flexible queries unnecessary for 25 fixed endpoints. Adds resolver layer + N+1 concerns.
- **Hand-written TS interfaces** — Drift between server and client. Manual sync burden.

## Consequences
- **Positive:** schema is auto-generated and authoritative. Swagger UI ships free. TS types stay in sync.
- **Negative:** codegen step must run on every backend type change (CI hook or pre-commit).

## Trade-offs
Simplicity + standardization prioritized. REST scales fine for this read-heavy app.

## Tooling
- `openapi-typescript` for type generation
- `openapi-fetch` (or custom thin wrapper) for runtime
- Generated file checked into git for IDE convenience
