# python.educrs.com

A free, interactive, offline-first Python course for complete beginners.
Python runs **in your browser** (Pyodide/WebAssembly) — no installation, no account, no cost.

> 🚧 **Early access.** Built in the open; things will change.

## How it works

| Piece | Where | Notes |
|---|---|---|
| Learning app | `apps/web` → `python.educrs.com` | Astro (static) + Svelte islands, design tokens from `packages/ui` |
| Python sandbox | `apps/run` → `python-educrs-run.<account>.workers.dev` | Pyodide in a worker on a **different site**, strict CSP, no network, no access to the app's storage |
| Domain core | `packages/core` | Ports, registries, event envelope + upcasters. Framework-free (enforced) |
| Strings | `packages/i18n` | Every UI string goes through `t(key)` |
| Curriculum map | `content/concepts.toml` | 173 concepts, validated as a DAG; `docs/01-concept-graph.md` is generated |

Design decisions and the roadmap live in [`docs/00-MASTER-PLAN.md`](docs/00-MASTER-PLAN.md) (in Turkish).

## Develop

Requirements: Node ≥ 22.23 (`.nvmrc`), Python ≥ 3.11 for content tools. pnpm comes via Corepack.

```bash
corepack enable
pnpm install
pnpm dev          # app on http://localhost:4321, sandbox on http://127.0.0.1:4322
```

Run everything CI runs:

```bash
pnpm exec playwright install chromium firefox webkit   # once
pnpm run check
```

## License

Code: [MIT](LICENSE). Course content in `content/`: [CC BY-SA 4.0](content/LICENSE).
"Python" is a registered trademark of the Python Software Foundation; this project is not affiliated with the PSF.

---

**Türkçe özet:** Yeni başlayanlar için ücretsiz, etkileşimli ve çevrimdışı çalışan bir Python kursu. Python kodu tarayıcıda, uygulamadan ayrı bir sitede ve tamamen izole şekilde çalışır. Ana plan ve bütün tasarım kararları `docs/` klasöründe Türkçe olarak yer alır.
