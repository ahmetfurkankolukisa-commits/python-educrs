/**
 * Architecture boundaries (plan §2.3 #4, §2.4.1 #8). CI fails on any violation, so the
 * architecture cannot erode silently. tools/tests/test_boundaries.mjs proves each rule
 * actually fires by planting a deliberate violation.
 */
const { INFRA, STORAGE, THIRD_PARTY_UI } = require("./tools/boundary-patterns.cjs");

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "core-is-pure",
      comment: "packages/core, i18n and gamification hold domain logic only: no framework, storage, runtime or UI imports.",
      severity: "error",
      from: { path: "^packages/(core|i18n|gamification)/" },
      to: { path: INFRA },
    },
    {
      name: "core-depends-on-nothing-internal",
      comment: "packages/core sits at the bottom of the graph.",
      severity: "error",
      from: { path: "^packages/core/" },
      to: { path: "^(packages/(?!core/)|apps/)" },
    },
    {
      name: "gamification-depends-only-on-core",
      comment: "XP, goal and streak are pure functions of events (docs/05-f3-mvp0.md §15.1): packages/gamification may import @educrs/core and nothing else of ours.",
      severity: "error",
      from: { path: "^packages/gamification/" },
      to: { path: "^(packages/(?!core/|gamification/)|apps/)" },
    },
    {
      name: "ui-libs-only-via-packages-ui",
      comment: "Apps use third-party UI only through @educrs/ui wrappers, so a library can be swapped in one place.",
      severity: "error",
      from: { path: "^apps/" },
      to: { path: THIRD_PARTY_UI },
    },
    {
      name: "storage-only-via-packages-store",
      comment: "IndexedDB access (Dexie) lives behind the LocalStore port in packages/store, so storage can be swapped or faked in one place (docs/05-f3-mvp0.md §14.1).",
      severity: "error",
      from: { pathNot: "^packages/store/" },
      to: { path: STORAGE },
    },
    {
      name: "packages-never-import-apps",
      severity: "error",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // node_modules is NOT excluded: excluded modules vanish as dependency targets too,
    // which would silently disable the third-party rules. doNotFollow stops traversal instead.
    exclude: { path: "(^|/)(dist|storybook-static|\\.astro)/|\\.test\\.ts$|^apps/run/(src|scripts)/" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      extensions: [".ts", ".js", ".mjs", ".svelte", ".astro", ".json"],
    },
  },
};
