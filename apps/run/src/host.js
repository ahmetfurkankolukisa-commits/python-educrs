// Sandbox host page (runs on the sandbox site inside the app's iframe).
// Owns: service worker (sync stdin), worker pool (active + warm spare), message relay.
//
// Protocol v1 (docs/05-f3-mvp0.md §6):
//   app -> hello {protocol}            sandbox checks e.origin against the allowlist and LOCKS it
//   sandbox -> hello-ack               (sent to the locked origin only — never "*")
//   sandbox -> ready {caps}            once Python is loaded
//   app -> run | stdin | stop | config | check   accepted only from the locked origin + window.parent
//
// "check" (grading) always runs in a FRESH worker that is terminated afterwards, so user code
// that ran before (and may have tampered with the interpreter) cannot influence a grade.
const APP_ORIGIN = "__APP_ORIGIN__"; // exact production origin, replaced at build time
const PREVIEW_ORIGIN_REGEX = "__PREVIEW_ORIGIN_REGEX__"; // anchored regex or "" (no previews)
const PROTOCOL = 1;
const CHECK_TIMEOUT_MS = 10_000;       // learner code + grading, once the worker is ready
const CHECK_START_TIMEOUT_MS = 45_000; // a fresh worker must load Python within this (slow devices)

const previewRe = PREVIEW_ORIGIN_REGEX ? new RegExp(PREVIEW_ORIGIN_REGEX) : null;
const originAllowed = (o) => o === APP_ORIGIN || (previewRe !== null && previewRe.test(o));

const t0 = performance.now();
const caps = { sw: false, stdin: "prefill", swError: null, thirdParty: window.top !== window, protocol: PROTOCOL };

let parentOrigin = null; // locked on the first valid hello
let readyMsg = null;     // sent after hello-ack once Python is loaded

function toApp(msg) {
  if (parentOrigin !== null) window.parent.postMessage(msg, parentOrigin);
}

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
    caps.swError = String((err && err.message) || err);
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
let current = null;      // { runId, started } — the "Run" in the active worker
let currentCheck = null; // { runId, started, slot, timer } — the grade in a fresh worker
const ALLOWED_FROM_WORKER = new Set(["stdout", "stderr", "stdin_request", "result"]);
const str = (v) => typeof v === "string";

function spawnSpare() {
  const s = new Slot();
  spare = s;
  s.ready.catch((err) => { console.error("spare failed", err); if (spare === s) spare = null; });
}

/** Hand out the warm spare (or a new worker); the caller owns it and must kill it. */
function takeFreshSlot() {
  const s = spare || new Slot();
  spare = null;
  return s;
}

function attach(slot) {
  slot.handler = (m) => {
    // Everything from the worker is untrusted (user code can call postMessage).
    if (!m || typeof m !== "object" || !ALLOWED_FROM_WORKER.has(m.type)) return;
    if (!current || m.runId !== current.runId) return;
    if (m.type === "stdout" || m.type === "stderr") {
      if (str(m.text)) toApp({ type: m.type, runId: m.runId, text: m.text });
    } else if (m.type === "stdin_request") {
      if (str(m.reqId)) toApp({ type: "stdin_request", runId: m.runId, reqId: m.reqId });
    } else if (m.type === "result") {
      const r = {
        type: "result", runId: m.runId, status: m.status,
        error: str(m.error) ? m.error : null,
        extra: str(m.extra) ? m.extra : null,
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
  active = takeFreshSlot();
  attach(active);
  spawnSpare();
}

function finishCheck(result) {
  const c = currentCheck;
  if (!c) return;
  currentCheck = null;
  clearTimeout(c.timer);
  c.slot.kill(); // a graded worker is never reused
  if (!spare) spawnSpare();
  toApp({ type: "result", runId: c.runId, durationMs: performance.now() - c.started, ...result });
}

async function startCheck(m) {
  if (currentCheck) { toApp({ type: "result", runId: m.runId, status: "error", error: "busy" }); return; }
  const slot = takeFreshSlot();
  // The deadline starts NOW: a worker that never finishes loading must not hang the check forever.
  const startTimer = setTimeout(() => finishCheck({ status: "timeout", error: `grading worker did not start within ${CHECK_START_TIMEOUT_MS} ms` }), CHECK_START_TIMEOUT_MS);
  currentCheck = { runId: m.runId, started: performance.now(), slot, timer: startTimer };
  slot.handler = (wm) => {
    if (!wm || typeof wm !== "object" || wm.type !== "result" || !currentCheck || wm.runId !== m.runId) return;
    finishCheck({ status: wm.status, error: str(wm.error) ? wm.error : null, extra: str(wm.extra) ? wm.extra : null });
  };
  try {
    await slot.ready;
  } catch (err) {
    finishCheck({ status: "error", error: `worker failed to start: ${String((err && err.message) || err)}` });
    return;
  }
  if (!currentCheck || currentCheck.slot !== slot) return;
  clearTimeout(startTimer);
  currentCheck.timer = setTimeout(() => finishCheck({ status: "timeout", error: `no result after ${CHECK_TIMEOUT_MS} ms` }), CHECK_TIMEOUT_MS);
  // Grading never blocks on input(): specs provide inputs explicitly.
  slot.post({ type: "run", runId: m.runId, code: m.code, mode: "check", spec: m.spec, seed: m.seed, stdinMode: "prefill" });
}

window.addEventListener("message", async (e) => {
  if (e.source !== window.parent) return;
  const m = e.data;
  if (!m || typeof m !== "object") return;

  if (parentOrigin === null) {
    // Handshake: the only message accepted before an origin is locked.
    if (m.type === "hello" && m.protocol === PROTOCOL && originAllowed(e.origin)) {
      parentOrigin = e.origin;
      toApp({ type: "hello-ack", protocol: PROTOCOL });
      if (readyMsg) toApp(readyMsg);
    }
    return;
  }
  if (e.origin !== parentOrigin) return;

  if (m.type === "hello") { // idempotent (e.g. the app re-mounted its component)
    toApp({ type: "hello-ack", protocol: PROTOCOL });
    if (readyMsg) toApp(readyMsg);
    return;
  }
  if (m.type === "config") {
    if (typeof m.stdinTimeoutMs === "number") navigator.serviceWorker?.controller?.postMessage({ type: "config", stdinTimeoutMs: m.stdinTimeoutMs });
    return;
  }
  if (m.type === "run" && str(m.runId) && str(m.code)) {
    if (current) { toApp({ type: "result", runId: m.runId, status: "error", error: "busy" }); return; }
    await active.ready;
    current = { runId: m.runId, started: performance.now() };
    active.post({ type: "run", runId: m.runId, code: m.code, mode: m.mode === "explain" || m.mode === "trace" ? m.mode : "run", stdinMode: caps.stdin });
    return;
  }
  if (m.type === "check" && str(m.runId) && str(m.code) && str(m.spec) && Number.isSafeInteger(m.seed)) {
    await startCheck(m);
    return;
  }
  if (m.type === "stdin" && str(m.reqId) && str(m.value)) {
    navigator.serviceWorker?.controller?.postMessage({ type: "stdin", reqId: m.reqId, value: m.value });
    return;
  }
  if (m.type === "stop") {
    const stoppedAt = performance.now();
    const run = current;
    current = null;
    recycle(); // kill, promote the warm spare, start a new spare in the background
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
  readyMsg = { type: "ready", loadMs: performance.now() - t0, workerLoadMs: active.loadMs, caps };
} catch (err) {
  readyMsg = { type: "ready", loadMs: -1, caps: { ...caps, fatal: String((err && err.message) || err) } };
}
toApp(readyMsg);
