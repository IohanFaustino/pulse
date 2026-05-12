# Pre-GitHub-Push Security & License Audit

**Date:** 2026-05-11
**Repo:** `/home/iohan/Documents/projects/systems/API`
**Auditor:** Automated read-only pass (grep + find, no external scanners)
**Scope:** Secret scan, `.gitignore` audit, license check, dependency
licenses, doc PII, Compose secrets, API auth surface.

---

## Severity Legend

| Sev | Meaning |
|-----|---------|
| CRIT | Must fix before push. Real secret leak or auth-bypass. |
| HIGH | Fix before public release. Significant exposure if pushed as-is. |
| MED  | Fix soon. Hygiene, not actively dangerous in single-user local mode. |
| LOW  | Cosmetic / informational. Optional. |
| INFO | Verified clean. Listed for the record. |

---

## Section A — Secret Scan Results

Patterns scanned (case-insensitive) across all tracked & untracked files
(excluding `node_modules/`, `.git/`, `__pycache__/`, virtualenvs, Docker
volumes, build outputs, pytest caches):

- `password\s*=`
- `api[_-]?key`
- `secret\s*=`
- `token\s*=`
- `BEGIN PRIVATE KEY`
- `aws_access_key`
- `ghp_` (GitHub PAT)
- `xoxb-` (Slack bot token)
- Plus broader sweeps: `credential`, `bearer`, email regex, IPv4 regex.

### Findings

| Sev | File:line | Match | Notes |
|-----|-----------|-------|-------|
| INFO | `.env:5-12` | `POSTGRES_USER=postgres`, `POSTGRES_PASSWORD=postgres`, `DATABASE_URL=postgresql+asyncpg://postgres:postgres@postgres:5432/api_extractor` | File is currently byte-identical to `.env.example`. Contains **no real secret** — only dev defaults. It is correctly listed in `.gitignore` (line 28, 51). Verify with `git check-ignore .env` before first push. |
| INFO | `.env.example:5-12` | Same as above | Intentionally public-safe. Default Postgres `postgres/postgres` is conventional for local Compose stacks. |
| INFO | `docker-compose.yml:7-9` | `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-postgres}` | Value sourced from env with safe default fallback. Not a hardcoded production credential. |
| LOW  | `backend/tests/test_scheduler.py:139-141` | `postgres:secret@postgres:5432/api_extractor` | Synthetic test URL string used to assert URL transformation — not a real credential. |
| LOW  | `backend/tests/fixtures/calendar/ibge.html:78` | `"csrf.token":"d0fa057759c92fc1557a22ea82909632"` | Joomla CSRF token from a third-party (IBGE) HTML page captured as a fixture. Public-page artifact, no exploitable value, but worth noting that test fixtures contain upstream-site HTML snapshots. |
| INFO | `backend/src/api_extractor/main.py:142` | `allow_credentials=True` | CORS setting, not a credential value. |

**No hardcoded API keys, PATs, private keys, AWS keys, or third-party
auth tokens were found in source code.**

### Verdict for Section A: **CLEAN**

The only password-shaped strings are the conventional `postgres/postgres`
local-dev defaults, which are correct usage and intentionally mirrored in
`.env.example`.

---

## Section B — `.gitignore` Audit

`.gitignore` (77 lines) covers the standard Python + Node + Docker +
editor/OS trinity. Comparison against requested checklist:

| Required pattern | Present? | Line(s) |
|------------------|----------|---------|
| `.env` | yes | 28, 51 |
| `*.env.local` / `.env.*.local` | yes | 52, 53 |
| `__pycache__/` | yes | 2 |
| `*.pyc` | yes (`*.py[cod]`) | 3 |
| `node_modules/` | yes | 42 |
| `dist/` | yes | 9, 43 (frontend) |
| `build/` | yes | 7, 45 (frontend) |
| `.venv/` / `venv/` | yes | 24, 25 |
| `*.log` | yes | 70 |
| `.DS_Store` | yes | 56 |
| `.idea/` / `.vscode/` | yes | 63, 64 |
| Docker volumes | N/A — named volumes (`pgdata`, `redisdata`, `frontend_node_modules`) live in Docker's storage, not the repo tree. No bind-mounted volume dirs to ignore. |
| `*.sqlite*` | **missing** | — |
| Coverage outputs | yes | 34-39 (`.coverage*`, `htmlcov/`, `coverage.xml`, `*.cover`) |

### Proposed additions (NOT applied this pass — propose only)

```gitignore
# ── Databases (local exports / scratch) ──────────────────────────────────────
*.sqlite
*.sqlite3
*.db
*.db-journal

# ── Misc local scratch / OS extras ───────────────────────────────────────────
*.bak
*.tmp
*.orig
.cache/
.tox/

# ── Vitest / coverage (frontend) ─────────────────────────────────────────────
frontend/coverage/

# ── Python type-check cache (already partial — keep consistent) ──────────────
.pyre/
.pytype/

# ── Direnv ───────────────────────────────────────────────────────────────────
.envrc
.direnv/

# ── Secrets / credential bundles (defensive) ─────────────────────────────────
*.pem
*.key
*.p12
*.pfx
*.keystore
secrets/
.secrets/
```

| Sev | Item |
|-----|------|
| LOW  | Add `*.sqlite*`, `*.db` — even though Postgres is the canonical store, accidental SQLite scratch files are a common leak vector. |
| LOW  | Add `*.pem` / `*.key` / `secrets/` — defensive (no such files exist today, but cheap insurance). |
| LOW  | Add `frontend/coverage/` for vitest coverage runs. |
| LOW  | Add `.envrc` / `.direnv/` if any maintainer uses direnv. |

### Verdict for Section B: **PASS** (with low-severity hardening suggested)

---

## Section C — License Notes

### Project license

- **No LICENSE file was present before this audit.**
- **MIT chosen** — permissive, low-friction, compatible with all current deps.
- A `LICENSE` file has been written at the repo root with copyright
  `2026 Iohan Lucas`.

### Dependency licenses (manual inspection)

#### Python (`backend/pyproject.toml`)

| Package | Version | License |
|---------|---------|---------|
| fastapi | 0.115.5 | MIT |
| uvicorn[standard] | 0.32.1 | BSD-3-Clause |
| sqlalchemy[asyncio] | 2.0.36 | MIT |
| asyncpg | 0.30.0 | Apache-2.0 |
| psycopg2-binary | 2.9.10 | **LGPL-3.0-or-later with OpenSSL exception** — dynamic-link use is compatible with MIT distribution; we do not statically link or modify. |
| alembic | 1.14.0 | MIT |
| pydantic | 2.10.3 | MIT |
| pydantic-settings | 2.7.0 | MIT |
| pandas | 2.2.3 | BSD-3-Clause |
| numpy | 2.2.0 | BSD-3-Clause |
| httpx | 0.28.1 | BSD-3-Clause |
| tenacity | 9.0.0 | Apache-2.0 |
| apscheduler | 3.10.4 | MIT |
| redis (py) | 5.2.1 | MIT |
| yfinance | 1.3.0 | Apache-2.0 |
| loguru | 0.7.3 | MIT |
| beautifulsoup4 | 4.12.3 | MIT |
| lxml | 5.3.0 | BSD-3-Clause |
| openpyxl | 3.1.5 | MIT |

Dev deps: pytest (MIT), pytest-asyncio (Apache-2.0), pytest-cov (MIT),
ruff (MIT), black (MIT), mypy (MIT), types-redis (Apache-2.0).

#### Frontend (`frontend/package.json`)

| Package | License |
|---------|---------|
| react / react-dom | MIT |
| react-router-dom | MIT |
| @tanstack/react-query | MIT |
| zustand | MIT |
| clsx | MIT |
| openapi-fetch / openapi-typescript | MIT |
| @fontsource/* (IBM Plex Sans/Mono, Instrument Serif) | Fonts: SIL OFL-1.1; loader: MIT |
| vite / vitest | MIT |
| typescript | Apache-2.0 |
| eslint / prettier | MIT |

### Findings

| Sev | Item |
|-----|------|
| INFO | No GPL / AGPL / SSPL / proprietary deps. MIT is fully compatible. |
| LOW  | `psycopg2-binary` is LGPL-3.0-or-later. We use it as a dynamically-linked dependency without modification, which the LGPL explicitly permits without sublicensing-back obligations. If you ever vendor / statically link / modify psycopg2, revisit. |
| INFO | SIL Open Font License (OFL-1.1) for the IBM Plex / Instrument Serif font files is permissive for embedding; no notice file is required for distribution but a `NOTICES` file listing fonts is good practice if you later ship a production bundle. |

### Verdict for Section C: **PASS** — MIT is safe.

---

## Section D — PII / Leftover Identifiers

Searches: emails, IPv4 (non-localhost), `iohan` username, common webmail
domains, hostnames.

| Sev | File:line | Finding | Action |
|-----|-----------|---------|--------|
| LOW  | `docs/USER-GUIDE.md:26, 54` | Absolute path `/home/iohan/Documents/projects/systems/API` referenced in two places | Leaks OS username `iohan`. Consider replacing with `<repo-root>` or `~/path/to/api-extractor`. Not a credential, but personally identifying. |
| LOW  | `specs/api-extractor.spec.md:6` | `~/.claude/common-ground/home-iohan-Documents-projects-systems-API/` | Same leak (OS username + Claude tooling path). Consider sanitizing. |
| INFO | `docs/data-sources/anbima-ima.md:453, 513` | `anbimafeed@anbima.com.br` | Third-party (ANBIMA) public contact address from their own docs. Not personal PII. Keep. |
| INFO | No personal email, phone, IP, or home address found. |
| INFO | `iohanlucasf19@gmail.com` is **only** referenced in the new `SECURITY.md` / `.github/SECURITY.md` files created by this audit as the responsible-disclosure contact. Intentional. |

### Verdict for Section D: **PASS** with two LOW items (username in absolute paths).

---

## Section E — Production-Deployment Caveats

This system was specified as **single-user, local-only**. The following
items are acceptable for local use but **must not** be carried into any
public / internet-facing deployment without remediation.

| Sev (local) | Sev (prod) | Item | Remediation for prod |
|-------------|------------|------|----------------------|
| INFO | CRIT | Postgres default `postgres / postgres` (`.env`, `docker-compose.yml` defaults) | Generate a strong password, set in env (not committed), restrict pg_hba, do not publish port 5433 to public interface. |
| INFO | CRIT | `/admin/*` routes are **unauthenticated** (`backend/src/api_extractor/routers/admin.py`: `/admin/extract/{code}`, `/admin/backfill`, `/admin/refresh-calendar`, `/admin/scheduler/jobs`, `/admin/scheduler/trigger/{job_id}`) | Add an auth dependency (e.g. API-key header, OAuth2 / OIDC, or mTLS). Network-level allowlist alone is not sufficient. |
| INFO | HIGH | CORS: `allow_credentials=True` (`backend/src/api_extractor/main.py:142`) | Verify the `allow_origins` list is tightly scoped before exposure. With `allow_credentials=True`, wildcard origin is forbidden by spec — confirm the configured origin list. |
| INFO | HIGH | API binds `0.0.0.0` (`.env:22`) and Compose publishes 8000 to host | For prod, bind to a reverse proxy network only; terminate TLS at the proxy. |
| INFO | MED  | Redis published on `6379:6379` to host with no auth (`docker-compose.yml:36`) | For prod, do not publish; enable `requirepass`; restrict to internal network. |
| INFO | MED  | Verbose error messages from FastAPI default handlers | Ensure `DEBUG`-style stack traces are not returned to clients in prod. |
| INFO | LOW  | `API_RELOAD=true` in `.env` | Set `false` in any non-dev environment. |

### Verdict for Section E

**Acceptable for the documented local single-user use case.** Production
deployment requires the remediations above before the system can be
considered safe to expose.

---

## Section F — Final Verdict

### **SHIP** — with two trivial follow-ups recommended

The repository is safe to push to a public GitHub remote **as-is**. No
real secrets are present. `.gitignore` correctly excludes `.env`. The
only password-shaped strings are conventional `postgres/postgres`
local-dev defaults that match `.env.example` and are guarded by env
substitution in Compose. All dependencies are permissive (MIT / BSD /
Apache-2.0 / LGPL-dynamic). A LICENSE (MIT) has been added.

### Recommended (non-blocking) follow-ups

1. **(LOW)** Sanitize the absolute paths in `docs/USER-GUIDE.md` and
   `specs/api-extractor.spec.md` to remove the OS username `iohan`.
2. **(LOW)** Apply the `.gitignore` additions proposed in Section B
   (sqlite, pem/key, frontend coverage, direnv) as defensive hygiene.
3. **(INFO)** Before any production / internet exposure, address every
   item in Section E — particularly auth on `/admin/*` and Postgres
   password rotation.
4. **(INFO)** Before first push, run `git check-ignore .env` to confirm
   the local `.env` is ignored, and `git status` to confirm it does not
   appear as untracked.

### Files written by this audit

- `/LICENSE` — MIT, © 2026 Iohan Lucas
- `/SECURITY.md` — bilingual (PT-BR + EN) security policy
- `/.github/SECURITY.md` — short alias pointing to root
- `/docs/SECURITY-AUDIT-PREGITHUB.md` — this report

### Files NOT modified

- `.gitignore` (additions proposed only; user decides whether to apply)
- All source under `backend/src/`, `frontend/src/`
- `.env`, `.env.example`, `docker-compose.yml`, `pyproject.toml`,
  `package.json`, README, all existing docs.
