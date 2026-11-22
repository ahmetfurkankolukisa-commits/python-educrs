#!/usr/bin/env node
// dependency-cruiser cannot parse .astro files. This scans their frontmatter and <script>
// blocks for import specifiers and applies the same "UI libraries only via @educrs/ui" rule.
// Usage: node tools/check-astro-imports.mjs [--json]
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { THIRD_PARTY_UI } = createRequire(import.meta.url)("./boundary-patterns.cjs");
const uiRe = new RegExp(THIRD_PARTY_UI);

const files = [];
const walk = (dir) => {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", "storybook-static", ".astro"].includes(d.name)) continue;
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p);
    else if (d.name.endsWith(".astro")) files.push(p);
  }
};
if (fs.existsSync(path.join(root, "apps"))) walk(path.join(root, "apps"));

const violations = [];
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src)?.[1] ?? "";
  const scripts = [...src.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  for (const m of `${front}\n${scripts}`.matchAll(/(?:import\s+(?:[^'"]*?\s+from\s+)?|import\s*\(\s*)["']([^"']+)["']/g)) {
    if (uiRe.test(m[1])) violations.push({ rule: { name: "ui-libs-only-via-packages-ui" }, from: path.relative(root, file), to: m[1] });
  }
}

if (process.argv.includes("--json")) console.log(JSON.stringify({ summary: { violations } }));
else {
  for (const v of violations) console.log(`  error ${v.rule.name}: ${v.from} → ${v.to}`);
  console.log(violations.length ? `x ${violations.length} .astro import violation(s)` : `✔ no .astro import violations (${files.length} files checked)`);
}
process.exit(violations.length ? 1 : 0);
