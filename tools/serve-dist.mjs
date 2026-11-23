#!/usr/bin/env node
// Static server that applies a Cloudflare Pages `_headers` file, so local runs and
// e2e tests exercise the exact headers we deploy. Zero dependencies.
// Usage: node tools/serve-dist.mjs <dir> <host> <port>
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".json": "application/json", ".wasm": "application/wasm",
  ".zip": "application/zip", ".whl": "application/zip", ".py": "text/plain; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2", ".xml": "application/xml",
};

/** Parse Cloudflare `_headers`: a path pattern line, then indented `Name: value` lines. */
export function parseHeaders(text) {
  const rules = [];
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    if (!/^\s/.test(raw)) {
      current = { pattern: raw.trim(), headers: {} };
      rules.push(current);
    } else if (current) {
      const i = raw.indexOf(":");
      current.headers[raw.slice(0, i).trim()] = raw.slice(i + 1).trim();
    }
  }
  return rules;
}

function matches(pattern, pathname) {
  const re = new RegExp("^" + pattern.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
  return re.test(pathname);
}

export function headersFor(rules, pathname) {
  const out = {};
  for (const r of rules) if (matches(r.pattern, pathname)) Object.assign(out, r.headers);
  return out;
}

export function serve(dir, host, port) {
  const root = path.resolve(dir);
  const rulesFile = path.join(root, "_headers");
  const rules = fs.existsSync(rulesFile) ? parseHeaders(fs.readFileSync(rulesFile, "utf8")) : [];
  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, `http://${host}`);
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    let file = path.normalize(path.join(root, decoded));
    if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(400).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!fs.existsSync(file) && fs.existsSync(file + ".html")) file += ".html";
    const headers = headersFor(rules, pathname);
    if (!fs.existsSync(file) || path.basename(file) === "_headers") {
      res.writeHead(404, { ...headers, "Content-Type": "text/plain" }).end("not found");
      return;
    }
    res.writeHead(200, { ...headers, "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, host, () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir = "dist", host = "127.0.0.1", port = "4322"] = process.argv.slice(2);
  serve(dir, host, Number(port)).then(() => console.log(`serving ${dir} on http://${host}:${port}`));
}
