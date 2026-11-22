#!/usr/bin/env node
// JS budget gate for apps/web/dist (plan §2.4.4, docs/05-f3-mvp0.md §5). gzip -9, per page:
//   firstPaint — inline scripts + <script src> + modulepreload (+ their static imports)
//   islands    — what island hydration loads up front (static import closure of component/renderer)
//   lazy       — dynamic import() closure loaded later (e.g. CodeMirror after first paint)
// Invariant: every .js file in dist/_astro must be reachable from some page. A chunk nobody
// accounts for means the import scanner missed a syntax (it once missed `import(\`...\`)` and
// silently ignored a 123 KB chunk) — that fails the gate instead of passing it.
// Pyodide lives on the sandbox site and is outside this budget by design.
import fs from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "apps", "web", "dist");
const BUDGETS = { firstPaint: 50 * 1024, islands: 60 * 1024, lazy: 160 * 1024 };

const gz = (buf) => gzipSync(buf, { level: 9 }).length;
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const Q = "[\"'`]"; // quotes Vite may emit, including template literals
const STATIC_RE = new RegExp(`(?:\\bfrom\\s*|\\bimport\\s*)${Q}((?:\\.{1,2})?/[^"'\`]+\\.js)${Q}`, "g");
const DYNAMIC_RE = new RegExp(`\\bimport\\s*\\(\\s*${Q}((?:\\.{1,2})?/[^"'\`]+\\.js)${Q}`, "g");

function resolve(fromUrl, spec) {
  return spec.startsWith("/") ? spec : path.posix.join(path.posix.dirname(fromUrl), spec);
}

function imports(url, re) {
  const file = path.join(dist, url);
  if (!fs.existsSync(file)) return [];
  const src = fs.readFileSync(file, "utf8");
  return [...src.matchAll(re)].map((m) => resolve(url, m[1]));
}

/** Static closure of the given entry URLs. */
function staticClosure(entries) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    queue.push(...imports(url, STATIC_RE));
  }
  return seen;
}

const size = (files) => [...files].reduce((n, f) => n + (fs.existsSync(path.join(dist, f)) ? gz(fs.readFileSync(path.join(dist, f))) : 0), 0);

if (!fs.existsSync(dist)) { console.error("apps/web/dist missing — run `pnpm build` first"); process.exit(1); }
const pages = [];
(function walk(dir) {
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p);
    else if (d.name.endsWith(".html")) pages.push(p);
  }
})(dist);

let failed = false;
const accounted = new Set();
for (const page of pages) {
  const html = fs.readFileSync(page, "utf8");
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
  const blocking = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g), ...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  const islandEntries = [...html.matchAll(/(?:component|renderer)-url="([^"]+)"/g)].map((m) => m[1]);

  const first = staticClosure(blocking);
  const islands = new Set([...staticClosure(islandEntries)].filter((f) => !first.has(f)));
  const upFront = new Set([...first, ...islands]);
  const dynEntries = [...upFront].flatMap((u) => imports(u, DYNAMIC_RE));
  const lazy = new Set([...staticClosure(dynEntries)].filter((f) => !upFront.has(f)));
  for (const f of [...first, ...islands, ...lazy]) accounted.add(f);

  const inlineGz = inline.trim() ? gz(Buffer.from(inline)) : 0;
  const result = { firstPaint: inlineGz + size(first), islands: size(islands), lazy: size(lazy) };
  const rel = path.relative(dist, page);
  const parts = Object.entries(result).map(([k, v]) => {
    const ok = v <= BUDGETS[k];
    failed ||= !ok;
    return `${ok ? "" : "OVER "}${k} ${kb(v)} / ${kb(BUDGETS[k])}`;
  });
  console.log(`${parts.some((p) => p.startsWith("OVER")) ? "FAIL" : "PASS"}  ${rel.padEnd(14)} ${parts.join("   ")}`);
}

const allChunks = fs.existsSync(path.join(dist, "_astro"))
  ? fs.readdirSync(path.join(dist, "_astro")).filter((f) => f.endsWith(".js")).map((f) => `/_astro/${f}`)
  : [];
const orphans = allChunks.filter((c) => !accounted.has(c));
if (orphans.length) {
  failed = true;
  console.log(`FAIL  chunks not reachable from any page (import scanner missed a syntax?): ${orphans.join(", ")}`);
} else {
  console.log(`PASS  all ${allChunks.length} JS chunk(s) accounted for`);
}
process.exit(failed ? 1 : 0);
