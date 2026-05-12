# Política de Segurança / Security Policy

## Versões Suportadas

Este projeto está em desenvolvimento ativo. Apenas a branch `main` recebe
correções de segurança.

This project is under active development. Only the `main` branch receives
security fixes.

## Reportando uma Vulnerabilidade

Se você descobrir uma vulnerabilidade de segurança, **não abra uma issue
pública**. Em vez disso:

1. Abra uma issue no GitHub marcada com o label `security` e descreva o
   problema em termos gerais (sem detalhes exploráveis), **ou**
2. Envie um e-mail ao mantenedor: `iohanlucasf19@gmail.com` com o assunto
   `[SECURITY] api-extractor`.

If you discover a security vulnerability, **do not open a public issue**.
Instead:

1. Open a GitHub issue tagged with the `security` label describing the
   problem in general terms (no exploit details), **or**
2. Email the maintainer at `iohanlucasf19@gmail.com` with the subject
   `[SECURITY] api-extractor`.

## Expectativas

- Confirmação de recebimento em até 7 dias.
- Triagem inicial e plano de correção em até 30 dias.
- Crédito público (se desejado) após a correção ser publicada.

- Acknowledgement within 7 days.
- Initial triage and remediation plan within 30 days.
- Public credit (if desired) after the fix is released.

## Escopo

Este sistema é projetado como uma ferramenta local e single-user. Endpoints
`/admin/*` não possuem autenticação por design. Não exponha esta API à
internet sem adicionar autenticação, TLS e rotação de credenciais do
Postgres. Veja `docs/SECURITY-AUDIT-PREGITHUB.md` para detalhes.

This system is designed as a local, single-user tool. `/admin/*` endpoints
are unauthenticated by design. Do not expose this API to the public
internet without adding authentication, TLS, and rotating Postgres
credentials. See `docs/SECURITY-AUDIT-PREGITHUB.md` for details.
