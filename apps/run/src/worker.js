// Python worker (module worker on the sandbox site). Untrusted user code runs here.
import { loadPyodide } from "/__PYODIDE_DIR__/pyodide.mjs";

let runId = null;
let stdinMode = "prefill";
const outDec = new TextDecoder();
const errDec = new TextDecoder();

// Output control. Untrusted code can print without end (`while True: print(...)` is the classic
// beginner loop), and one message per line flooded the page until Chrome's tab crashed. Limits,
// applied here at the source:
//   1. the first BURST messages of a run go out at once, so normal programs stay interactive;
//   2. after that, output is batched: sent when BATCH_MS have passed or BATCH_BYTES are waiting;
//   3. after MAX_OUTPUT_BYTES in one run, the rest of its output is dropped.
// Pending output is always flushed before input() blocks and before the result is sent.
// MAX_OUTPUT_BYTES is above 4 bytes x the app's 100 000-character display limit, so the app always
// receives enough to show its own "the rest is not shown" note.
const BURST = 500;
const BATCH_MS = 50;
const BATCH_BYTES = 16_384;
const MAX_OUTPUT_BYTES = 450_000;
let sentBytes = 0;
let sentMessages = 0;
let pending = [];
let pendingBytes = 0;
let lastFlush = 0;

function resetOutput() {
  sentBytes = 0;
  sentMessages = 0;
  pending = [];
  pendingBytes = 0;
  lastFlush = 0;
}

function flushOutput() {
  for (const m of pending) postMessage({ type: m.type, runId, text: m.text });
  pending = [];
  pendingBytes = 0;
  lastFlush = performance.now();
}

function emit(type, decoder, buf) {
  const room = MAX_OUTPUT_BYTES - sentBytes;
  if (room > 0) {
    const part = buf.length > room ? buf.subarray(0, room) : buf;
    sentBytes += part.length;
    const text = decoder.decode(part, { stream: true });
    if (sentMessages < BURST) {
      sentMessages += 1;
      postMessage({ type, runId, text });
      lastFlush = performance.now();
    } else {
      const last = pending[pending.length - 1];
      if (last && last.type === type) last.text += text;
      else pending.push({ type, text });
      pendingBytes += part.length;
      if (pendingBytes >= BATCH_BYTES || performance.now() - lastFlush >= BATCH_MS) flushOutput();
    }
  }
  return buf.length; // always "written": Python must not see a short write
}

// COI-free blocking input(): a synchronous XHR that the service worker holds open.
function syncStdin() {
  if (stdinMode !== "sync-sw") return null; // EOF -> EOFError in Python
  const reqId = crypto.randomUUID();
  flushOutput(); // the prompt must be on screen before we block for the answer
  postMessage({ type: "stdin_request", runId, reqId });
  for (;;) {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", `/__sync/stdin?id=${encodeURIComponent(reqId)}`, false);
    xhr.send(null);
    if (xhr.status === 200) return xhr.responseText + "\n";
    if (xhr.status !== 204) throw new Error(`stdin transport failed: HTTP ${xhr.status}`);
    // 204 = SW wait round elapsed; ask again (user is still typing).
  }
}

let py;
let ns;
let wheelsLoaded = false;
try {
  py = await loadPyodide({ indexURL: "/__PYODIDE_DIR__/" });
  py.setStdout({ write: (buf) => emit("stdout", outDec, buf) });
  py.setStderr({ write: (buf) => emit("stderr", errDec, buf) });
  py.setStdin({ stdin: syncStdin });
  py.FS.mkdirTree("/educrs");
  for (const f of ["educrs_explain.py", "educrs_grader.py"]) {
    py.FS.writeFile(`/educrs/${f}`, await (await fetch(`/${f}`)).text());
  }
  const boot = await (await fetch("/bootstrap.py")).text();
  ns = py.toPy({});
  py.runPython(boot, { globals: ns });
  postMessage({ type: "ready", probe: ns.get("_probe")() });
} catch (err) {
  postMessage({ type: "fatal", error: String((err && err.stack) || err) });
}

self.onmessage = async (e) => {
  const m = e.data;
  if (!m || m.type !== "run") return;
  runId = m.runId;
  stdinMode = m.stdinMode;
  resetOutput();
  try {
    if (m.mode === "explain" && !wheelsLoaded) {
      const base = self.location.origin + "/wheels/";
      await py.loadPackage(["executing-2.3.0", "asttokens-3.0.2", "pure_eval-0.2.4", "stack_data-0.6.3"].map((w) => `${base}${w}-py3-none-any.whl`));
      wheelsLoaded = true;
    }
    const res = await ns.get("run_user")(m.code, m.mode, typeof m.spec === "string" ? m.spec : null, Number.isSafeInteger(m.seed) ? m.seed : 0);
    const [status, error, extra] = res.toJs();
    res.destroy();
    flushOutput();
    postMessage({ type: "result", runId, status, error, extra });
  } catch (err) {
    // The Python side itself is broken (e.g. user sabotaged our helpers) -> host must recycle.
    flushOutput();
    postMessage({ type: "result", runId, status: "error", error: `worker-corrupted: ${String(err && err.message || err)}` });
  }
};
