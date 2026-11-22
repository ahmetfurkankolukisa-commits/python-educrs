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
const PYODIDE_DIR = `pyodide-${pyodideVersion}`;

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, PYODIDE_DIR), { recursive: true });
fs.mkdirSync(path.join(dist, "wheels"), { recursive: true });

const tokens = { __APP_ORIGIN__: APP_ORIGIN, __PYODIDE_DIR__: PYODIDE_DIR };
for (const name of fs.readdirSync(path.join(root, "src"))) {
  let text = fs.readFileSync(path.join(root, "src", name), "utf8");
  for (const [k, v] of Object.entries(tokens)) text = text.replaceAll(k, v);
  if (/__[A-Z_]+__/.test(text) && !name.endsWith(".py")) throw new Error(`unreplaced token in ${name}`);
  fs.writeFileSync(path.join(dist, name), text);
}

for (const f of ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"]) {
  fs.copyFileSync(path.join(pyodideDir, f), path.join(dist, PYODIDE_DIR, f));
}
for (const f of fs.readdirSync(path.join(root, "wheels"))) {
  fs.copyFileSync(path.join(root, "wheels", f), path.join(dist, "wheels", f));
}

// Cloudflare Pages headers (also applied by tools/serve-dist.mjs locally and in e2e).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "connect-src 'self'",
  "worker-src 'self'",
  `frame-ancestors ${APP_ORIGIN}`,
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

fs.writeFileSync(path.join(dist, "build-info.json"), JSON.stringify({ pyodide: pyodideVersion, python: pythonVersion, appOrigin: APP_ORIGIN }, null, 2));
console.log(`run: built dist/ (Pyodide ${pyodideVersion}, Python ${pythonVersion}, app origin ${APP_ORIGIN})`);
