// Shared by .dependency-cruiser.cjs and tools/check-astro-imports.mjs so both enforce the same lists.
// Patterns match resolved paths (…/node_modules/svelte/…) AND bare names that pnpm's strict
// layout leaves unresolved (a package that doesn't declare the dependency sees just "svelte").
const pkgs = (names) => `(^|node_modules/)(${names.join("|")})(/|$)`;
module.exports = {
  INFRA: pkgs(["firebase", "@firebase", "pyodide", "svelte", "astro", "@astrojs", "dexie", "@codemirror", "codemirror", "bits-ui", "tailwindcss"]),
  STORAGE: pkgs(["dexie"]),
  THIRD_PARTY_UI: pkgs(["bits-ui", "@lucide", "lucide-svelte", "svelte-sonner", "paneforge", "layerchart", "canvas-confetti", "@rive-app", "@codemirror", "codemirror", "@lezer"]),
};
