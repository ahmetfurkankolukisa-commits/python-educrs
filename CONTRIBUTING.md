# Contributing

Thanks for helping beginners learn Python! Every change is checked by CI, so you can contribute with confidence.

## Ground rules

1. **Plan first.** Architecture and algorithms are specified in `docs/00-MASTER-PLAN.md` before they are coded. Larger changes start as a plan update.
2. **Concept graph** (`content/concepts.toml`):
   - Concept ids are permanent — never rename or reuse one.
   - List only *direct, necessary* prerequisites; the validator rejects redundant ones.
   - Run `pnpm test:concepts`, then `pnpm docs:concepts` to regenerate `docs/01-concept-graph.md` (never edit that file by hand).
3. **Lessons** are step lists in `content/en/lessons/<concept>.toml` (start with an explain step, end with an exercise, at least 3 exercises). **Exercises** live in `content/en/exercises/<concept>/<slug>/` (`exercise.toml` + `.py` files). Run `pnpm content` after any change and commit the regenerated `content/build/` and `content/golden/` files; CI rejects stale ones. Every misconception needs a wrong program that triggers it (plan §3.2). Expected outputs and predict-output answers are computed, never typed.
4. **UI strings** go through `t("namespace.key")` from `@educrs/i18n` — no hard-coded text in components.
5. **Third-party UI libraries** are imported only inside `packages/ui`. `pnpm lint:deps` enforces this and the other boundaries.
6. **Colours** come from `packages/ui/src/tokens.css`; contrast is unit-tested in every theme.
7. **Dependencies** must pass the acceptance criteria in plan §2.4.1 (license, maintenance, a11y, size, types). Versions are pinned; Renovate proposes updates.
8. **Never weaken the sandbox** (`apps/run`): no `'unsafe-eval'`, no extra `connect-src`, no `postMessage` to `"*"`.

## Checks

```bash
pnpm run check   # typecheck, unit + property tests, concept graph, CPython/Pyodide parity,
          # architecture rules (+ proof they fire), builds, JS budget, e2e on 4 browsers
```

## Content license

By contributing to `content/` you agree to license your contribution under CC BY-SA 4.0; code contributions are MIT.
