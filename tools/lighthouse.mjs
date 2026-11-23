#!/usr/bin/env node
// Lighthouse gate for the built sites (docs/05-f3-mvp0.md §17.10). Run `pnpm build:e2e` first.
// Serves the same dist folders as e2e (real _headers), opens the Chromium that Playwright pins,
// and measures each page with Lighthouse's default mobile profile (slow 4G, 4x CPU slowdown).
// SEO is not measured on purpose: the site is noindex during early access.
// Usage: node tools/lighthouse.mjs [--min 90] [--runs 1]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import lighthouse from "lighthouse";
import { serve } from "./serve-dist.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const MIN = arg("min", 90);
const RUNS = arg("runs", 1);
const CATEGORIES = ["performance", "accessibility", "best-practices"];
const PAGES = [
  ["home", "/"],
  ["path", "/learn/"],
  ["settings", "/settings/"],
  ["lesson", "/learn/m0/intro-program/"],
];
const PORT = 9333;
const ORIGIN = "http://localhost:4321";

for (const dir of ["apps/web/dist", "apps/run/dist"]) {
  if (!fs.existsSync(path.join(root, dir, "index.html"))) {
    console.error(`${dir} missing — run \`pnpm build:e2e\` first`);
    process.exit(1);
  }
}

const servers = [await serve(path.join(root, "apps/web/dist"), "localhost", 4321), await serve(path.join(root, "apps/run/dist"), "127.0.0.1", 4322)];
const browser = await chromium.launch({ args: [`--remote-debugging-port=${PORT}`] });
const outDir = path.join(root, "test-results", "lighthouse");
fs.mkdirSync(outDir, { recursive: true });

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
let failed = false;
try {
  for (const [name, url] of PAGES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const result = await lighthouse(`${ORIGIN}${url}`, { port: PORT, output: "json", logLevel: "error", onlyCategories: CATEGORIES });
      if (!result?.lhr) throw new Error(`no Lighthouse result for ${url}`);
      if (result.lhr.runtimeError) throw new Error(`${url}: ${result.lhr.runtimeError.message}`);
      runs.push(result.lhr);
      fs.writeFileSync(path.join(outDir, `${name}-${i + 1}.json`), JSON.stringify(result.lhr));
    }
    const score = (c) => Math.round(median(runs.map((r) => (r.categories[c].score ?? 0) * 100)));
    const metric = (id) => median(runs.map((r) => r.audits[id]?.numericValue ?? NaN));
    const scores = Object.fromEntries(CATEGORIES.map((c) => [c, score(c)]));
    const low = CATEGORIES.filter((c) => scores[c] < MIN);
    if (low.length) failed = true;
    console.log(
      `${low.length ? "FAIL" : "PASS"}  ${name.padEnd(9)} perf ${String(scores.performance).padStart(3)}  a11y ${String(scores.accessibility).padStart(3)}  best ${String(scores["best-practices"]).padStart(3)}` +
        `   LCP ${(metric("largest-contentful-paint") / 1000).toFixed(1)} s  TBT ${Math.round(metric("total-blocking-time"))} ms  CLS ${metric("cumulative-layout-shift").toFixed(3)}`,
    );
    if (low.length) {
      // Name what cost points, so the fix doesn't start with opening a report.
      const last = runs[runs.length - 1];
      for (const c of low) {
        const refs = last.categories[c].auditRefs.filter((a) => a.weight > 0 && (last.audits[a.id].score ?? 1) < 0.9);
        for (const a of refs) console.log(`        ${c}: ${a.id} = ${last.audits[a.id].displayValue ?? last.audits[a.id].score}`);
      }
    }
  }
} finally {
  await browser.close();
  for (const s of servers) s.close();
}
console.log(failed ? `\nFAILED: a category is below ${MIN}` : `\nOK: every category >= ${MIN} on ${PAGES.length} pages (${RUNS} run(s) each, median)`);
process.exit(failed ? 1 : 0);
