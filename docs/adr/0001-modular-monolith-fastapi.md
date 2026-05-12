# ADR-0001: Modular monolith on FastAPI

## Status
Accepted — 2026-05-11

## Context
v1 targets local single-user deploy with 25 indices. Scope includes scheduled extraction, REST API, and pandas transforms. Need clear evolution path to scale or split later.

## Decision
Single FastAPI process containing routers, services, repositories, transform engine, and APScheduler. Modular package boundaries enforced by directory + import lint rules.

## Alternatives Considered
- **Microservices (extractor worker + API + scheduler)** — Premature for single-user scope. Adds network hops, more failure modes, more infra.
- **Celery + Redis beat for scheduling** — Heavy for 25 jobs. Re-introduces worker complexity. Defer until scale demands it.
- **Plain Python script + cron** — No HTTP layer, can't serve UI. Not a fit.

## Consequences
- **Positive:** one process to run, one log stream, easy to debug locally. Async I/O keeps extractor + API responsive in same loop.
- **Negative:** extractor failure could block API event loop if not awaited correctly. Restart cycles all components together.

## Trade-offs
Simplicity prioritized over isolation. Modular package layout preserves option to extract worker later without rewriting business logic.

## Migration path
If scheduler workload grows, swap `AsyncIOScheduler` → `Celery` + separate worker container. Repository layer remains unchanged.
