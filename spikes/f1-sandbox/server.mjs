// F1 spike: three local "sites" (no dependencies).
//   app  = http://localhost:4100   (the learning app; plants secrets)
//   run  = http://127.0.0.1:4200   (sandbox site: Pyodide + service worker, strict CSP)
//   evil = http://127.0.0.1:4300   (attacker: counts every request it receives)
// localhost and 127.0.0.1 are different *sites*, which models app vs *-run.pages.dev.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_ORIGIN = "http://localhost:4100";
export const RUN_ORIGIN = "http://127.0.0.1:4200";
export const EVIL_ORIGIN = "http://127.0.0.1:4300";

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".wasm": "application/wasm",
  ".zip": "application/zip", ".json": "application/json", ".whl": "application/zip",
  ".map": "application/json", ".py": "text/plain; charset=utf-8",
};

// The policy under test (mirrors the plan, §3.1).
const RUN_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "connect-src 'self'",
  "worker-src 'self'",
  `frame-ancestors ${APP_ORIGIN}`,
].join("; ");
const APP_CSP = [
  "default-src 'self'",
  `frame-src ${RUN_ORIGIN}`,
  "script-src 'self'",
  "connect-src 'self'",
].join("; ");

function serveFile(res, file, headers) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, headers); res.end("not found"); return; }
    res.writeHead(200, { ...headers, "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Content-Length": st.size });
    fs.createReadStream(file).pipe(res);
  });
}

function safeJoin(root, urlPath) {
  const p = path.normalize(path.join(root, decodeURIComponent(urlPath)));
  return p.startsWith(root) ? p : null;
}

export const evilHits = [];

export function start() {
  const servers = [];
  const listen = (handler, host, port) => new Promise((resolve) => {
    const s = http.createServer(handler);
    s.on("upgrade", (req, socket) => { if (port === 4300) evilHits.push({ method: "UPGRADE", url: req.url }); socket.destroy(); });
    s.listen(port, host, () => resolve(s));
    servers.push(s);
  });

  const app = (req, res) => {
    const u = new URL(req.url, APP_ORIGIN);
    const file = safeJoin(path.join(here, "app"), u.pathname === "/" ? "/index.html" : u.pathname);
    serveFile(res, file, { "Content-Security-Policy": APP_CSP, "Cache-Control": "no-store" });
  };

  const run = (req, res) => {
    const u = new URL(req.url, RUN_ORIGIN);
    let file;
    if (u.pathname.startsWith("/pyodide/")) file = safeJoin(path.join(here, "node_modules", "pyodide"), u.pathname.slice("/pyodide".length));
    else file = safeJoin(path.join(here, "run"), u.pathname === "/" ? "/index.html" : u.pathname);
    const cache = u.pathname.startsWith("/pyodide/") || u.pathname.startsWith("/wheels/") ? "public, max-age=0, must-revalidate" : "no-store";
    serveFile(res, file, { "Content-Security-Policy": RUN_CSP, "Cache-Control": cache });
  };

  const evil = (req, res) => {
    const u = new URL(req.url, EVIL_ORIGIN);
    if (u.pathname === "/embed.html") {
      // Attacker page that tries to embed our sandbox (frame-ancestors must block it).
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!doctype html><title>evil</title><script>window.gotReady=false;addEventListener('message',e=>{if(e.data&&e.data.type==='ready')window.gotReady=true})</script><iframe src="${RUN_ORIGIN}/index.html"></iframe>`);
      return;
    }
    evilHits.push({ method: req.method, url: req.url });
    res.writeHead(200, { "Access-Control-Allow-Origin": "*", "Content-Type": "text/plain" });
    res.end("stolen");
  };

  return Promise.all([
    listen(app, "localhost", 4100),
    listen(run, "127.0.0.1", 4200),
    listen(evil, "127.0.0.1", 4300),
  ]).then(() => ({ close: () => Promise.all(servers.map((s) => new Promise((r) => { s.closeAllConnections?.(); s.close(r); }))) }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start().then(() => console.log(`app ${APP_ORIGIN}  run ${RUN_ORIGIN}  evil ${EVIL_ORIGIN}`));
}
