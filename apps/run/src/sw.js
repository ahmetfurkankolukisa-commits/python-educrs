// Sandbox service worker:
//  1. /__sync/stdin?id=…  — holds a *synchronous* XHR from the Python worker open until the
//     page delivers the user's input (COI-free replacement for SharedArrayBuffer + Atomics).
//     Long waits are split into rounds: after `timeoutMs` we answer 204 and the worker retries,
//     so the browser never kills a fetch event that waits minutes for a slow typist.
//  2. /pyodide/* — cache-first, so Python loads offline and warm loads skip the network.
const PENDING = new Map(); // reqId -> resolve(value)
const VALUES = new Map();  // reqId -> value that arrived before the request
let timeoutMs = 15000;
const CACHE = "__PYODIDE_DIR__";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("message", (e) => {
  const m = e.data;
  if (!m || typeof m !== "object") return;
  if (m.type === "config" && typeof m.stdinTimeoutMs === "number") { timeoutMs = m.stdinTimeoutMs; return; }
  if (m.type === "claim") { e.waitUntil(self.clients.claim()); return; }
  if (m.type === "stdin" && typeof m.reqId === "string" && typeof m.value === "string") {
    const resolve = PENDING.get(m.reqId);
    if (resolve) { PENDING.delete(m.reqId); resolve(m.value); }
    else VALUES.set(m.reqId, m.value);
  }
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/__sync/stdin") {
    const id = url.searchParams.get("id") || "";
    e.respondWith(new Promise((respond) => {
      const ok = (v) => respond(new Response(v, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } }));
      if (VALUES.has(id)) { const v = VALUES.get(id); VALUES.delete(id); ok(v); return; }
      const timer = setTimeout(() => { PENDING.delete(id); respond(new Response(null, { status: 204 })); }, timeoutMs);
      PENDING.set(id, (v) => { clearTimeout(timer); ok(v); });
    }));
    return;
  }

  if (url.pathname.startsWith("/__PYODIDE_DIR__/") || url.pathname.startsWith("/wheels/")) {
    e.respondWith(caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }));
  }
});
