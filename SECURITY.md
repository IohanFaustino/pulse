# Security Policy

## Supported Versions

This project is under active development. Only the `main` branch receives
security fixes.

## Reporting a Vulnerability

If you discover a security vulnerability, **do not open a public issue**.
Instead:

1. Open a GitHub issue tagged with the `security` label describing the
   problem in general terms (no exploit details), **or**
2. Email the maintainer at `iohanlucasf19@gmail.com` with the subject
   `[SECURITY] pulse`.

## Expectations

- Acknowledgement within 7 days.
- Initial triage and remediation plan within 30 days.
- Public credit (if desired) after the fix is released.

## Scope

This system is designed as a local, single-user tool. `/admin/*` endpoints
are unauthenticated by design. Do not expose this API to the public
internet without adding authentication, TLS, and rotating Postgres
credentials. See `docs/SECURITY-AUDIT-PREGITHUB.md` for details.
