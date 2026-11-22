#!/usr/bin/env node
// Proves every architecture rule actually fires: plant a deliberate violation, run
// dependency-cruiser, expect that exact rule in the report, then clean up.
// Run: node tools/tests/test_boundaries.mjs   (exit 1 on any miss)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const bin = path.join(root, "node_modules", ".bin", "depcruise");

// A resolvable stand-in for a third-party UI library (pnpm keeps real ones out of apps/web).
const FAKE_UI_PKG = "apps/web/node_modules/bits-ui";
const fixtures = { [`${FAKE_UI_PKG}/package.json`]: '{"name":"bits-ui","version":"0.0.0","main":"index.js"}', [`${FAKE_UI_PKG}/index.js`]: "export {};" };

const CASES = [
  { name: "core imports a framework", file: "packages/core/src/__violation.ts", body: 'import "svelte";\nexport {};\n', rule: "core-is-pure" },
  { name: "i18n imports a framework", file: "packages/i18n/src/__violation.ts", body: 'import "astro";\nexport {};\n', rule: "core-is-pure" },
  { name: "core imports another package", file: "packages/core/src/__violation.ts", body: 'import "../../i18n/src/index.ts";\nexport {};\n', rule: "core-depends-on-nothing-internal" },
  { name: "package imports an app", file: "packages/ui/src/__violation.ts", body: 'import "../../../apps/web/astro.config.mjs";\nexport {};\n', rule: "packages-never-import-apps" },
  { name: "app .ts uses UI lib directly", file: "apps/web/src/__violation.ts", body: 'import "bits-ui";\nexport {};\n', rule: "ui-libs-only-via-packages-ui" },
  { name: "app .svelte uses UI lib directly", file: "apps/web/src/components/__Violation.svelte", body: '<script lang="ts">\n  import "bits-ui";\n</script>\n', rule: "ui-libs-only-via-packages-ui" },
  { name: "app .astro uses UI lib directly", file: "apps/web/src/components/__Violation.astro", body: '---\nimport "bits-ui";\n---\n<p>x</p>\n', rule: "ui-libs-only-via-packages-ui" },
  { name: "circular import", file: "packages/ui/src/__a.ts", body: 'import "./__b.ts";\nexport const a = 1;\n', extra: { "packages/ui/src/__b.ts": 'import "./__a.ts";\nexport const b = 1;\n' }, rule: "no-circular" },
];

function cruise() {
  // The JSON reporter may exit 0 even when it reports violations: always parse stdout.
  let out;
  try {
    out = execFileSync(bin, ["apps", "packages", "--config", ".dependency-cruiser.cjs", "--output-type", "json"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 }).toString();
  } catch (e) {
    out = e.stdout?.toString() ?? "";
  }
  const summary = JSON.parse(out).summary;
  if (!summary || !Array.isArray(summary.violations)) throw new Error("unexpected dependency-cruiser output");
  // .astro files are checked by our own scanner (dependency-cruiser can't parse them).
  let astro;
  try { astro = execFileSync(process.execPath, ["tools/check-astro-imports.mjs", "--json"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] }).toString(); }
  catch (e) { astro = e.stdout?.toString() ?? ""; }
  return { violations: [...summary.violations, ...JSON.parse(astro).summary.violations] };
}

const write = (rel, body) => { const p = path.join(root, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, body); return p; };
let failed = 0;
const planted = [];
try {
  for (const [rel, body] of Object.entries(fixtures)) planted.push(write(rel, body));
  const baseline = cruise().violations ?? [];
  if (baseline.length) { console.log("FAIL  clean tree already has violations:", baseline.map((v) => v.rule.name)); failed++; }
  else console.log("PASS  clean tree has no violations");

  for (const c of CASES) {
    const files = [write(c.file, c.body), ...Object.entries(c.extra ?? {}).map(([r, b]) => write(r, b))];
    const rules = new Set((cruise().violations ?? []).map((v) => v.rule.name));
    for (const f of files) fs.rmSync(f);
    if (rules.has(c.rule)) console.log(`PASS  ${c.name.padEnd(34)} -> ${c.rule}`);
    else { console.log(`FAIL  ${c.name.padEnd(34)} expected ${c.rule}, got [${[...rules].join(", ")}]`); failed++; }
  }
} finally {
  for (const p of planted) fs.rmSync(p, { force: true });
  fs.rmSync(path.join(root, FAKE_UI_PKG), { recursive: true, force: true });
}
console.log(`\n${CASES.length + 1 - failed}/${CASES.length + 1} passed`);
process.exit(failed ? 1 : 0);
