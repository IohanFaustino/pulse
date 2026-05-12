# GitHub Actions Workflows

This directory contains the CI/CD automation for the API Extractor project.
Add the badge block below to the root `README.md` once the repository is pushed to GitHub
(replace `{owner}` and `{repo}` with actual values).

```markdown
[![CI](https://github.com/{owner}/{repo}/actions/workflows/ci.yml/badge.svg)](https://github.com/{owner}/{repo}/actions/workflows/ci.yml)
[![Docker Publish](https://github.com/{owner}/{repo}/actions/workflows/docker-publish.yml/badge.svg)](https://github.com/{owner}/{repo}/actions/workflows/docker-publish.yml)
```

---

## Workflows

### `ci.yml` — Main CI Pipeline

**Triggers:** Push to `main`, pull requests targeting `main`.

**Concurrency:** A concurrency group keyed on the branch/PR ref cancels any in-progress
run when a new commit is pushed. This prevents redundant runs from wasting runner minutes.

| Job | Purpose | Path filter | Depends on |
|-----|---------|-------------|-----------|
| `backend-tests` | Run `pytest` suite against real TimescaleDB + Redis service containers | `backend/**` changes or push to `main` | — |
| `frontend-tests` | Run Vitest + TypeScript type check | `frontend/**` changes or push to `main` | — |
| `lint` | Ruff lint + format check (Python), tsc + Prettier check (TS/TSX/CSS) | Always | — |
| `docker-build` | Build `api` + `web` images to validate Dockerfiles; no push | Always | `lint` |
| `security-scan` | Gitleaks secret scan, Trivy filesystem CVE scan, pip-audit, npm audit | Always | — |

**Key design decisions:**

- `backend-tests` and `frontend-tests` use path filters via the `if:` expression to avoid running
  the slow database-backed test suite for frontend-only PRs, and vice versa.
- The Postgres service container uses `timescale/timescaledb:2.26.4-pg16` — the same image as
  `docker-compose.yml` — ensuring tests run against an identical database configuration.
- The TimescaleDB extension is bootstrapped via a `psql` command that mirrors
  `infra/postgres/init.sql`, because service containers do not mount init scripts.
- Coverage artifacts (XML) are uploaded for both backend and frontend and retained for 14 days.
- `npm audit` runs with `continue-on-error: true` because it exits non-zero even for moderate
  advisories that may not be exploitable in this context; findings still appear in logs.
- `docker-build` for the frontend uses `continue-on-error: true` until `frontend/Dockerfile`
  (production Nginx build) is created.

**Required secrets:** None beyond the automatic `GITHUB_TOKEN`.

---

### `docker-publish.yml` — Image Publishing

**Triggers:** Push of a tag matching `v[0-9]+.[0-9]+.[0-9]+` (semantic version).

**What it does:**

1. Builds `api-extractor-api` (FastAPI) and `api-extractor-web` (React/Vite) images.
2. Pushes to GitHub Container Registry (GHCR) with two tags each:
   - The semantic version tag (e.g. `v1.2.3`, `1.2`)
   - The short commit SHA (e.g. `a3b2c1d`) for exact rollback identification.
3. Multi-arch: `linux/amd64` + `linux/arm64` via QEMU cross-compilation on the amd64 runner.
4. Uses registry-mode BuildKit cache (`type=registry`) for persistent layer caching across runs.

**Image names:**

```
ghcr.io/{owner}/api-extractor-api:{tag}
ghcr.io/{owner}/api-extractor-api:{short-sha}
ghcr.io/{owner}/api-extractor-web:{tag}
ghcr.io/{owner}/api-extractor-web:{short-sha}
```

**Required secrets:** Only `GITHUB_TOKEN` (provided automatically by GitHub Actions).
The workflow has `packages: write` permission to push to GHCR.

---

## Dependabot

`.github/dependabot.yml` configures weekly automated dependency updates:

| Ecosystem | Directory | Day | Max open PRs |
|-----------|-----------|-----|-------------|
| `pip` (Python) | `/backend` | Monday | 5 |
| `npm` (JavaScript) | `/frontend` | Monday | 5 |
| `docker` (Dockerfiles) | `/backend` | Tuesday | 5 |
| `docker` (Compose images) | `/` | Tuesday | 5 |
| `github-actions` | `/` | Wednesday | 5 |

Minor/patch updates are grouped into single PRs per ecosystem to reduce noise.

---

## Local Development

Use `make ci-local` to replicate CI checks locally before pushing:

```bash
make ci-local
```

Scan for accidentally committed secrets:

```bash
make secrets-scan
```

---

## Adding New Workflows

1. Create a new `.yml` file in `.github/workflows/`.
2. Validate YAML syntax: `python -c "import yaml; yaml.safe_load(open('.github/workflows/your-file.yml'))"`
3. Update this README with the new workflow's purpose and trigger.
4. Add a badge to the root `README.md`.

---

## Security Notes

- No hardcoded secrets appear in any workflow file. All sensitive values use `${{ secrets.X }}`.
- `actions/checkout@v4`, `actions/setup-python@v5`, `actions/setup-node@v4`, and
  `actions/cache@v4` are pinned to major version tags. For stricter supply-chain security,
  pin to full SHA commits (e.g. `actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683`)
  and automate updates via Dependabot's `github-actions` ecosystem.
- Gitleaks runs on `fetch-depth: 0` (full history) to catch secrets introduced in any commit.
