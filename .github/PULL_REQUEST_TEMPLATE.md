## Summary

<!--
  Describe WHAT this PR does and WHY. One or two sentences are enough.
  Link the related issue using "Closes #<issue-number>" so it auto-closes on merge.
-->

Closes #

---

## Type of Change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to change)
- [ ] Refactor (no functional changes)
- [ ] Infrastructure / CI (workflow, Docker, Makefile changes)
- [ ] Documentation only

---

## Checklist

### General
- [ ] My code follows the project's coding style (ruff/prettier pass locally)
- [ ] I have performed a self-review of my own code
- [ ] I have added comments to hard-to-understand areas
- [ ] My changes generate no new warnings

### Tests
- [ ] I have added tests that prove my fix/feature works
- [ ] All existing tests pass locally (`make test` or `pytest tests/ -q`)
- [ ] Frontend tests pass (`npm run test` in `frontend/`)
- [ ] TypeScript type check passes (`npm run typecheck`)

### Documentation
- [ ] I have updated the relevant ADR(s) in `docs/adr/` if an architectural decision was made
- [ ] I have updated `README.md` if user-facing behavior changed
- [ ] OpenAPI schema changes are reflected in `backend/openapi.json` (run `make codegen` if needed)

### Frontend (skip if backend-only PR)
- [ ] I have attached screenshots or a screen recording of the UI changes below
- [ ] The changes are responsive / work at common viewport sizes
- [ ] I tested in at least one major browser (Chrome or Firefox)

### Infrastructure (skip if code-only PR)
- [ ] `docker compose up` still works after my changes
- [ ] No secrets or `.env` values are hardcoded in workflow YAML
- [ ] New environment variables are documented in `.env.example`

---

## Screenshots / Screen Recording

<!--
  Required for PRs that change any UI (Painel, Indices, Calendario, Metadados).
  Drag and drop images here or link a Loom recording.
  Skip this section for backend/infra-only changes.
-->

| Before | After |
|--------|-------|
| _(screenshot)_ | _(screenshot)_ |

---

## Testing Notes

<!--
  Describe how you tested this PR:
  - What commands did you run?
  - What edge cases did you verify?
  - Any manual testing steps a reviewer should follow?
-->
