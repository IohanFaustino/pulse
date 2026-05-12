# Makefile — API Extractor developer workflow
# Usage: make <target>

COMPOSE = docker compose
BACKEND  = backend
PYTEST   = $(COMPOSE) exec api pytest

.PHONY: up down restart logs \
        migrate seed \
        test fmt lint typecheck \
        shell-api shell-db \
        ci-local secrets-scan

# ── Infrastructure ────────────────────────────────────────────────────────────

## Bring up all services in detached mode.
up:
	$(COMPOSE) up -d

## Stop and remove all containers (volumes are preserved).
down:
	$(COMPOSE) down

## Restart all services.
restart:
	$(COMPOSE) restart

## Stream logs from all services. Pass service= to filter: make logs service=api
logs:
	$(COMPOSE) logs -f $(service)

# ── Database ──────────────────────────────────────────────────────────────────

## Run Alembic migrations inside the api container (Phase 1+).
migrate:
	$(COMPOSE) exec api alembic upgrade head

## Run the seed script to populate 25 series metadata (Phase 1+).
seed:
	$(COMPOSE) exec api python -m api_extractor.seed

# ── Testing ───────────────────────────────────────────────────────────────────

## Run the full pytest suite inside the api container.
test:
	$(PYTEST) backend/tests/ -v

## Run only fast unit tests (no DB/Redis required).
test-unit:
	$(PYTEST) backend/tests/ -v -m "not integration"

# ── Code quality ──────────────────────────────────────────────────────────────

## Format Python code with black.
fmt:
	$(COMPOSE) exec api black src/ tests/

## Lint Python code with ruff (src only; tests added incrementally per phase).
lint:
	$(COMPOSE) exec api ruff check src/

## Type-check Python code with mypy.
typecheck:
	$(COMPOSE) exec api mypy src/

# ── Convenience shells ────────────────────────────────────────────────────────

## Open a bash shell inside the api container.
shell-api:
	$(COMPOSE) exec api bash

## Open a psql shell connected to the api_extractor database.
shell-db:
	$(COMPOSE) exec postgres psql -U postgres -d api_extractor

# ── CI / Security ─────────────────────────────────────────────────────────────

## Replicate CI checks locally without Docker Compose.
## Runs: ruff lint, ruff format check, pytest with coverage, tsc, prettier.
## Requires: Python 3.12 + backend venv activated, Node 20 + frontend deps installed.
## Run from the repo root. Use 'make up' first if you need Postgres/Redis.
ci-local:
	@echo "==> [1/5] Ruff lint (backend)"
	cd backend && ruff check src/
	@echo "==> [2/5] Ruff format check (backend)"
	cd backend && ruff format --check src/
	@echo "==> [3/5] Pytest with coverage (backend)"
	cd backend && pytest tests/ -q --cov=src --cov-report=term-missing
	@echo "==> [4/5] TypeScript type check (frontend)"
	cd frontend && npm run typecheck
	@echo "==> [5/5] Prettier format check (frontend)"
	cd frontend && npx prettier --check "src/**/*.{ts,tsx,css}"
	@echo ""
	@echo "All CI checks passed locally."

## Scan the repository for accidentally committed secrets using gitleaks.
## Runs gitleaks in Docker so no local install is needed.
## Pre-git state will show no findings; run again after 'git init && git add .'
## to detect secrets that would be committed.
secrets-scan:
	docker run --rm -v "$$(pwd):/repo" zricethezav/gitleaks:latest detect --source=/repo --verbose
