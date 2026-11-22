// Sandbox host page (runs on the sandbox site inside the app's iframe).
// Owns: service worker (sync stdin), worker pool (active + warm spare), message relay.
const APP_ORIGIN = "http://localhost:4100";
const t0 = performance.now();
const caps = { sw: false, stdin: "prefill", swError: null, thirdParty: window.top !== window };

async function setupServiceWorker() {
  if (!("serviceWorker" in navigator)) { caps.swError = "no serviceWorker API"; return; }
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    const reg = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      // Some engines (seen in Firefox, partitioned third-party iframe) load a reloaded page
      // uncontrolled even though the SW is active. Ask the SW to claim us explicitly.
      const claimed = new Promise((resolve, reject) => {
        navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
        setTimeout(() => reject(new Error("page not controlled after 5s")), 5000);
      });
      reg.active?.postMessage({ type: "claim" });
      await claimed;
      caps.claimedExplicitly = true;
    }
    caps.sw = true;
    caps.stdin = "sync-sw";
  } catch (err) {
    caps.swError = String(err && err.message || err);
  }
}

class Slot {
  constructor() {
    this.started = performance.now();
    this.worker = new Worker("/worker.js", { type: "module" });
    this.handler = null;
    this.ready = new Promise((resolve, reject) => {
      this.worker.onmessage = (e) => {
        const m = e.data;
        if (m && m.type === "ready") { this.loadMs = performance.now() - this.started; resolve(this); return; }
        if (m && m.type === "fatal") { reject(new Error(m.error)); return; }
        if (this.handler) this.handler(m);
      };
      this.worker.onerror = (e) => reject(new Error(e.message || "worker error"));
    });
  }
  post(msg) { this.worker.postMessage(msg); }
  kill() { this.worker.terminate(); }
}

let active = null;
let spare = null;
let current = null; // { runId, started }
let stdinTimeoutMs = 15000;
const ALLOWED_FROM_WORKER = new Set(["stdout", "stderr", "stdin_request", "result"]);

function toApp(msg) { window.parent.postMessage(msg, APP_ORIGIN); }

function spawnSpare() {
  spare = new Slot();
  spare.ready.catch((err) => { console.error("spare failed", err); spare = null; });
}

function attach(slot) {
  slot.handler = (m) => {
    // Everything from the worker is untrusted (user code can call postMessage).
    if (!m || typeof m !== "object" || !ALLOWED_FROM_WORKER.has(m.type)) return;
    if (!current || m.runId !== current.runId) return;
    if (m.type === "stdout" || m.type === "stderr") {
      if (typeof m.text === "string") toApp({ type: m.type, runId: m.runId, text: m.text });
    } else if (m.type === "stdin_request") {
      if (typeof m.reqId === "string") toApp({ type: "stdin_request", runId: m.runId, reqId: m.reqId });
    } else if (m.type === "result") {
      const r = {
        type: "result", runId: m.runId, status: m.status,
        error: typeof m.error === "string" ? m.error : null,
        extra: typeof m.extra === "string" ? m.extra : null,
        durationMs: performance.now() - current.started,
      };
      current = null;
      if (r.error && r.error.startsWith("worker-corrupted")) recycle();
      toApp(r);
    }
  };
}

function recycle() {
  active.kill();
  active = spare || new Slot();
  attach(active);
  spawnSpare();
}

window.addEventListener("message", async (e) => {
  if (e.origin !== APP_ORIGIN || e.source !== window.parent) return;
  const m = e.data;
  if (!m || typeof m !== "object") return;
  if (m.type === "config") {
    if (typeof m.stdinTimeoutMs === "number") {
      stdinTimeoutMs = m.stdinTimeoutMs;
      navigator.serviceWorker?.controller?.postMessage({ type: "config", stdinTimeoutMs });
    }
    return;
  }
  if (m.type === "run" && typeof m.runId === "string" && typeof m.code === "string") {
    if (current) { toApp({ type: "result", runId: m.runId, status: "error", error: "busy" }); return; }
    await active.ready;
    current = { runId: m.runId, started: performance.now() };
    active.post({ type: "run", runId: m.runId, code: m.code, mode: String(m.mode || "run"), stdinMode: caps.stdin });
    return;
  }
  if (m.type === "stdin" && typeof m.reqId === "string" && typeof m.value === "string") {
    navigator.serviceWorker?.controller?.postMessage({ type: "stdin", reqId: m.reqId, value: m.value });
    return;
  }
  if (m.type === "stop") {
    const stoppedAt = performance.now();
    const run = current;
    current = null;
    // Kill, promote the warm spare, start a new spare in the background.
    recycle();
    await active.ready;
    if (run) toApp({ type: "result", runId: run.runId, status: "interrupted", durationMs: performance.now() - run.started, readyAfterMs: performance.now() - stoppedAt });
  }
});

await setupServiceWorker();
active = new Slot();
attach(active);
try {
  await active.ready;
  spawnSpare();
  toApp({ type: "ready", loadMs: performance.now() - t0, workerLoadMs: active.loadMs, caps });
} catch (err) {
  toApp({ type: "ready", loadMs: -1, caps: { ...caps, fatal: String(err.message || err) } });
}
