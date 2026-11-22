// Builds the sandbox site into apps/run/dist.
//   APP_ORIGIN  — the only origin allowed to embed and talk to the sandbox
//                 (default: https://python.educrs.com; e2e uses http://localhost:4321)
// Pyodide is served from a versioned directory so it can be cached as immutable.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const require = createRequire(import.meta.url);
const pyodideDir = path.dirname(require.resolve("pyodide/package.json"));
const pyodideVersion = JSON.parse(fs.readFileSync(path.join(pyodideDir, "package.json"), "utf8")).version;
const pythonVersion = JSON.parse(fs.readFileSync(path.join(pyodideDir, "pyodide-lock.json"), "utf8")).info.python;

const APP_ORIGIN = process.env.APP_ORIGIN || "https://python.educrs.com";
if (new URL(APP_ORIGIN).origin !== APP_ORIGIN) throw new Error(`APP_ORIGIN must be a bare origin, got ${APP_ORIGIN}`);

// Optional: app preview deployments allowed to talk to the sandbox (protocol v1 handshake).
//   PREVIEW_ORIGIN_REGEX  — anchored regex matched against the parent's origin, e.g.
//                           ^https://[a-z0-9-]+-python-educrs\.<account>\.workers\.dev$
//   FRAME_ANCESTORS_EXTRA — space-separated CSP sources that may embed the sandbox
//                           (must cover the preview origins), e.g. https://*.<account>.workers.dev
const PREVIEW_ORIGIN_REGEX = process.env.PREVIEW_ORIGIN_REGEX || "";
const FRAME_ANCESTORS_EXTRA = (process.env.FRAME_ANCESTORS_EXTRA || "").trim().split(/\s+/).filter(Boolean);
if (PREVIEW_ORIGIN_REGEX) {
  if (!PREVIEW_ORIGIN_REGEX.startsWith("^") || !PREVIEW_ORIGIN_REGEX.endsWith("$")) throw new Error("PREVIEW_ORIGIN_REGEX must be anchored with ^ and $");
  new RegExp(PREVIEW_ORIGIN_REGEX); // throws on invalid syntax
  if (APP_ORIGIN.startsWith("https://") && !PREVIEW_ORIGIN_REGEX.startsWith("^https://")) throw new Error("PREVIEW_ORIGIN_REGEX must be https when the app origin is https");
  if (FRAME_ANCESTORS_EXTRA.length === 0) throw new Error("PREVIEW_ORIGIN_REGEX needs FRAME_ANCESTORS_EXTRA, or previews can't even embed the sandbox");
}
for (const src of FRAME_ANCESTORS_EXTRA) {
  if (!/^https?:\/\/(\*\.)?[a-z0-9.-]+(:\d+)?$/i.test(src) || src === "*" ) throw new Error(`invalid FRAME_ANCESTORS_EXTRA entry: ${src}`);
  if (APP_ORIGIN.startsWith("https://") && !src.startsWith("https://")) throw new Error(`FRAME_ANCESTORS_EXTRA must be https in production: ${src}`);
}
const PYODIDE_DIR = `pyodide-${pyodideVersion}`;

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, PYODIDE_DIR), { recursive: true });
fs.mkdirSync(path.join(dist, "wheels"), { recursive: true });

const tokens = { __APP_ORIGIN__: APP_ORIGIN, __PYODIDE_DIR__: PYODIDE_DIR };
for (const name of fs.readdirSync(path.join(root, "src"))) {
  let text = fs.readFileSync(path.join(root, "src", name), "utf8");
  // The regex lands inside a JS string literal: emit it as a JSON-escaped literal.
  text = text.replaceAll('"__PREVIEW_ORIGIN_REGEX__"', JSON.stringify(PREVIEW_ORIGIN_REGEX));
  for (const [k, v] of Object.entries(tokens)) text = text.replaceAll(k, v);
  if (/__[A-Z_]+__/.test(text) && !name.endsWith(".py")) throw new Error(`unreplaced token in ${name}`);
  fs.writeFileSync(path.join(dist, name), text);
}

for (const f of ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"]) {
  fs.copyFileSync(path.join(pyodideDir, f), path.join(dist, PYODIDE_DIR, f));
}
// The ONE grader shared with CI (packages/grader): the browser runs exactly what CI validated.
fs.copyFileSync(path.resolve(root, "..", "..", "packages", "grader", "educrs_grader.py"), path.join(dist, "educrs_grader.py"));
for (const f of fs.readdirSync(path.join(root, "wheels"))) {
  fs.copyFileSync(path.join(root, "wheels", f), path.join(dist, "wheels", f));
}

// Cloudflare Pages headers (also applied by tools/serve-dist.mjs locally and in e2e).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "connect-src 'self'",
  "worker-src 'self'",
  `frame-ancestors ${[APP_ORIGIN, ...FRAME_ANCESTORS_EXTRA].join(" ")}`,
].join("; ");
fs.writeFileSync(path.join(dist, "_headers"), `/*
  Content-Security-Policy: ${csp}
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  X-Robots-Tag: noindex
/${PYODIDE_DIR}/*
  Cache-Control: public, max-age=31536000, immutable
/wheels/*
  Cache-Control: public, max-age=86400
`);

fs.writeFileSync(path.join(dist, "build-info.json"), JSON.stringify({ pyodide: pyodideVersion, python: pythonVersion, appOrigin: APP_ORIGIN, previewOriginRegex: PREVIEW_ORIGIN_REGEX || null, frameAncestorsExtra: FRAME_ANCESTORS_EXTRA, protocol: 1 }, null, 2));
console.log(`run: built dist/ (Pyodide ${pyodideVersion}, Python ${pythonVersion}, app origin ${APP_ORIGIN})`);
