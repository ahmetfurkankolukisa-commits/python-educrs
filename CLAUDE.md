# CLAUDE.md — project instructions

## Communication
- Talk to the user in **Turkish**. Plan documents in `docs/` are Turkish; code, identifiers, UI strings and course content are **English**.
- The user wants everything planned and re-verified before coding ("algoritma haritaları"). Update `docs/00-MASTER-PLAN.md` (bump version + changelog line) when a decision changes.

## Commands
- `pnpm run check` — everything CI runs. Needs `pnpm exec playwright install chromium firefox webkit` once.
- `pnpm test` (vitest), `pnpm typecheck`, `pnpm lint:deps`, `pnpm test:boundaries`, `pnpm test:concepts`, `pnpm test:parity`, `pnpm budget`.
- `pnpm build:e2e && pnpm e2e` — e2e against built sites with the real `_headers`.
- `pnpm docs:concepts` regenerates `docs/01-concept-graph.md` from `content/concepts.toml`. Never hand-edit the generated doc.

## Non-negotiables
- **Sandbox** (`apps/run`) must stay a different *site* from the app (`python-educrs-run.<account>.workers.dev`; workers.dev is on the PSL), CSP without `'unsafe-eval'`, `connect-src 'self'`, `frame-ancestors` = app origin only. Grading always runs in a fresh worker.
- **Boundaries** (`.dependency-cruiser.cjs` + `tools/check-astro-imports.mjs`): `packages/core|i18n` import no frameworks; apps import UI libs only via `packages/ui`. Add a negative case to `tools/tests/test_boundaries.mjs` for every new rule.
- **Event sourcing**: stored events are never rewritten; upcast on read; unknown types preserved; reward rules are versioned and append-only (plan §3.5.6).
- **Versions are pinned.** TypeScript stays < 7 (Astro/Svelte checkers support 5–6). A Pyodide bump changes the Python version: re-run parity + content validation, and update CI's `python-version`.
- **Infra**: Cloudflare Workers with static assets (two workers: `python-educrs`, `python-educrs-run`; Pages is no longer the default) + Firebase on the **Spark** plan. Never upgrade Firebase Auth to Identity Platform (3k DAU cap). Flag anything that would need Blaze.
- Verify facts (npm/PyPI/docs) instead of trusting memory; prove checks fire with negative tests.
