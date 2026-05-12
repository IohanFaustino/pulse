# Phase 7: Frontend Scaffold

**Agent:** react-specialist  **Wave:** W1  **Skills:** react-expert, typescript-pro

---

## Files owned

### Create (new files)

| Path | Purpose |
|---|---|
| `frontend/package.json` | npm manifest — runtime + dev deps |
| `frontend/vite.config.ts` | Vite 5 config: host, port, proxy, path aliases |
| `frontend/tsconfig.json` | TS strict mode config |
| `frontend/tsconfig.node.json` | TS config for vite.config.ts itself |
| `frontend/index.html` | Vite entry HTML |
| `frontend/src/main.tsx` | React 18 StrictMode root, imports globals.css |
| `frontend/src/App.tsx` | BrowserRouter + QueryClientProvider + health status page |
| `frontend/src/App.module.css` | Module CSS for App layout |
| `frontend/src/App.test.tsx` | Vitest smoke test — renders without crash |
| `frontend/src/styles/tokens.css` | CSS custom properties from doc §8 palette |
| `frontend/src/styles/globals.css` | Font imports + CSS reset + token application |
| `frontend/src/api/schema.ts` | Hand-written stub for /health; replaced by codegen in Phase 5 |
| `frontend/src/api/client.ts` | openapi-fetch createClient with baseUrl env var |
| `frontend/src/setupTests.ts` | @testing-library/jest-dom setup for vitest |

### Edit (existing files)

| Path | Change |
|---|---|
| `docker-compose.yml` | Replace `web` command (tail → npm run dev), add `frontend_node_modules` named volume |

---

## Interfaces

### Consumed (from prior phases)
- `GET http://api:8000/health` → `{"status": "ok"}` (Phase 0 contract)
- `docker-compose` service `api` at DNS name `api:8000` (Phase 0 infrastructure)
- `web` service port mapping `5174:5173` (Phase 0 W0 deviation)

### Produced (for downstream phases)

| Interface | Consumer | Description |
|---|---|---|
| `frontend/src/api/schema.ts` | Phase 8 pages | TypeScript types for all API endpoints; stub now, codegen in Phase 5 |
| `frontend/src/api/client.ts` | Phase 8 pages | Typed openapi-fetch client (`GET`, `POST`, etc.) |
| `frontend/src/styles/tokens.css` | Phase 8 components | CSS custom properties for palette + typography |
| `frontend/src/styles/globals.css` | Phase 8 components | Font face declarations, CSS reset |
| `npm run codegen` script | Phase 8 / Phase 5 | Regenerates schema.ts from live OpenAPI JSON |
| Vite dev server on port 5173 in container (5174 on host) | Phase 8 dev workflow | HMR dev server |

---

## Test strategy

| Verification | Command | Expected |
|---|---|---|
| Container running | `docker compose ps web` | `running` state |
| Dev server reachable | `curl -fsS http://localhost:5174` | 200, returns HTML with `<div id="root">` |
| TypeScript clean | `docker compose exec web npm run typecheck` | exit 0, no errors |
| Vitest smoke | `docker compose exec web npm run test` | PASS — App renders |
| Proxy health check | `curl -fsS http://localhost:5174/api/health` | proxied to api:8000, returns `{"status":"ok"}` |

---

## Risks + mitigations

| Risk | Mitigation |
|---|---|
| `npm install` inside container slow (cold pull) | Use named volume `frontend_node_modules` to persist node_modules across container restarts; bind-mount only `./frontend:/app` excluding node_modules |
| `/openapi.json` not available yet (Phase 5 not done) | Hand-write `schema.ts` stub with `HealthResponse` type; `npm run codegen` is a separate script, not required for scaffold to pass tests |
| Vite proxy to `api:8000` fails if api container is unhealthy | Proxy is best-effort in dev; frontend tests are unit tests and don't hit real API. `web` depends_on api but won't fail on API health. |
| `openapi-typescript` v7 CLI may require `--` before output flag | Use exact CLI: `openapi-typescript <url> -o <file>` — verified in v7 docs |
| Hot reload breaks if node_modules on host and container diverge | Named volume `frontend_node_modules:/app/node_modules` prevents host mount from shadowing |
| Port 5174 already in use on host | Document in README; operator must free port. No code fix. |
| `@testing-library/jest-dom` needs explicit vitest setup file | Register `setupTests.ts` in `vite.config.ts` under `test.setupFiles` |

---

## Background services needed

| Service | Expected state | How to verify |
|---|---|---|
| `api` | Running + healthy | `curl http://localhost:8000/health` → 200 |
| `web` | Running after `docker compose up -d web` | `docker compose ps web` |
| `postgres` | Running + healthy (api depends on it) | `docker compose ps postgres` |
| `redis` | Running + healthy (api depends on it) | `docker compose ps redis` |

---

## Success criteria

| Criterion | Verified by |
|---|---|
| PLAN §6 Phase 7 checklist items 1–6 | File existence + npm scripts present |
| ADR-0007: Vite + React 18 + TS 5, CSS modules, no Tailwind, no CSS-in-JS | Code review of vite.config.ts + CSS files |
| Design tokens match doc §8 exactly (all hex values) | tokens.css diff against spec |
| Fonts loaded via @fontsource (Instrument Serif, IBM Plex Sans, IBM Plex Mono) | globals.css imports |
| React 18 StrictMode enabled | main.tsx `<React.StrictMode>` wrapper |
| `npm run test` green with vitest | CI-safe smoke test |
| `npm run typecheck` clean | TS strict mode + no `any` leaks |
| Vite dev server accessible at host:5174 | `curl http://localhost:5174` → 200 |

---

## Deviations from PLAN §6 Phase 7 checklist

| Item | Deviation | Reason |
|---|---|---|
| "pnpm add" | Using npm instead of pnpm | node:20-alpine image ships npm; pnpm not installed in W0 placeholder image. Installing pnpm adds complexity with no benefit for single-user local deploy. |
| Tailwind "optional" | Not using Tailwind | ADR-0007 explicitly chooses vanilla CSS modules. Prompt constraint reaffirms this. |
| Codegen against live `/openapi.json` | Stub schema for now | Phase 5 (API routes) not yet done. Codegen script is in package.json for Phase 5 to run. |
