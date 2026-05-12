# ADR-0007: Migrate frontend to Vite + React + TypeScript

## Status
Accepted — 2026-05-11

## Context
Doc prototype uses React + Babel CDN with no build step. Workable for prototype but lacks type safety, tree-shaking, asset pipeline, and modern tooling. Will grow into a real app with API integration, routing, and shared types.

## Decision
Migrate to Vite + React 18 + TypeScript. Preserve doc design tokens, fonts, motion conventions. Adopt CSS modules (or vanilla CSS w/ variables) — no heavy CSS-in-JS lib.

## Alternatives Considered
- **Keep React + Babel CDN** — Zero build, but no types, no codegen integration, weak DX at scale.
- **Next.js App Router** — SSR + RSC unnecessary for local single-user dashboard. Vercel-shaped. Heavier.
- **SvelteKit / Solid** — Doc prototype is already React; rewriting cost > benefit.

## Consequences
- **Positive:** TS end-to-end with generated API types. Vite HMR fast. Easy to add testing (vitest + RTL).
- **Negative:** build step, dependency tree, more moving parts than a single HTML file.

## Trade-offs
DX + correctness > zero-build simplicity.

## Tooling
- Vite 5
- React 18
- TypeScript 5
- react-router-dom 6
- @tanstack/react-query 5
- openapi-typescript + openapi-fetch
- Fonts via `@fontsource/instrument-serif` and `@fontsource/ibm-plex-*`
