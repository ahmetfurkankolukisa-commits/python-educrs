#!/usr/bin/env node
// JS budget gate for apps/web/dist (plan §2.4.4). Two numbers per page, gzip -9:
//   firstPaint — inline scripts + <script src> + modulepreload: what blocks or races first paint
//   page       — firstPaint + every island chunk reachable through static/dynamic imports
// Pyodide lives on the sandbox site and is outside this budget by design.
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "apps", "web", "dist");
const BUDGETS = { firstPaint: 50 * 1024, page: 120 * 1024 };

const gz = (buf) => gzipSync(buf, { level: 9 }).length;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

function reachable(entryUrls) {
  const seen = new Set();
  const queue = [...entryUrls];
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    const file = path.join(dist, url);
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+\.js)["']/g)) {
      queue.push(path.posix.join(path.posix.dirname(url), m[1]));
    }
  }
  return [...seen];
}

const pages = [];
const walk = (dir) => {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p);
    else if (d.name.endsWith(".html")) pages.push(p);
  }
};
if (!fs.existsSync(dist)) { console.error("apps/web/dist missing — run `pnpm build` first"); process.exit(1); }
walk(dist);

let failed = false;
for (const page of pages) {
  const html = fs.readFileSync(page, "utf8");
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const blocking = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g), ...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  const islands = [...html.matchAll(/(?:component|renderer)-url="([^"]+)"/g)].map((m) => m[1]);

  const firstFiles = reachable(blocking);
  const allFiles = reachable([...blocking, ...islands]);
  const sum = (files) => files.reduce((n, f) => n + (fs.existsSync(path.join(dist, f)) ? gz(fs.readFileSync(path.join(dist, f))) : 0), 0);
  const inlineGz = inline.trim() ? gz(Buffer.from(inline)) : 0;
  const firstPaint = inlineGz + sum(firstFiles);
  const total = inlineGz + sum(allFiles);

  const rel = path.relative(dist, page);
  const ok1 = firstPaint <= BUDGETS.firstPaint;
  const ok2 = total <= BUDGETS.page;
  failed ||= !ok1 || !ok2;
  console.log(`${ok1 && ok2 ? "PASS" : "FAIL"}  ${rel.padEnd(24)} firstPaint ${kb(firstPaint)} / ${kb(BUDGETS.firstPaint)}   page ${kb(total)} / ${kb(BUDGETS.page)}   (${allFiles.length} chunk(s))`);
}
process.exit(failed ? 1 : 0);
