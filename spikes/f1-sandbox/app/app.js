// App side of the sandbox protocol. Trusts nothing that comes from the sandbox:
// checks origin + source, accepts only known message types with typed fields,
// and renders output with textContent only (never innerHTML).
const RUN_ORIGIN = "http://127.0.0.1:4200";

// ---- plant secrets that the sandboxed code must NOT be able to reach
localStorage.setItem("secret", "S3CRET-APP");
document.cookie = "session=S3CRET-COOKIE; SameSite=Lax; path=/";

const frame = document.getElementById("sandbox");
const out = document.getElementById("out");
const statusEl = document.getElementById("status");
const ask = document.getElementById("ask");
const answer = document.getElementById("answer");

let resolveReady;
const ready = new Promise((r) => (resolveReady = r));
const runs = new Map();
let seq = 0;
let askingFor = null;
const dropped = [];

const str = (v) => typeof v === "string";
const num = (v) => typeof v === "number" && Number.isFinite(v);

window.addEventListener("message", (e) => {
  if (e.origin !== RUN_ORIGIN || e.source !== frame.contentWindow) return;
  const m = e.data;
  if (!m || typeof m !== "object" || !str(m.type)) return;
  if (m.type === "ready") {
    statusEl.textContent = `Python ready (${Math.round(m.loadMs)} ms, stdin: ${m.caps?.stdin})`;
    resolveReady({ loadMs: num(m.loadMs) ? m.loadMs : null, caps: m.caps && typeof m.caps === "object" ? { ...m.caps } : {} });
    return;
  }
  const run = runs.get(m.runId);
  if (!run) { dropped.push(m.type); return; }
  switch (m.type) {
    case "stdout":
    case "stderr":
      if (!str(m.text)) return;
      run.output += m.text;
      out.textContent += m.text; // plain text only
      break;
    case "stdin_request":
      if (!str(m.reqId)) return;
      if (run.inputs.length) {
        const { value, delayMs } = run.inputs.shift();
        setTimeout(() => sendStdin(m.runId, m.reqId, value), delayMs || 0);
      } else {
        askingFor = { runId: m.runId, reqId: m.reqId };
        ask.hidden = false;
        answer.focus();
      }
      break;
    case "result":
      runs.delete(m.runId);
      run.resolve({
        status: ["ok", "error", "interrupted"].includes(m.status) ? m.status : "invalid",
        error: str(m.error) ? m.error : null,
        extra: str(m.extra) ? m.extra : null,
        durationMs: num(m.durationMs) ? m.durationMs : null,
        readyAfterMs: num(m.readyAfterMs) ? m.readyAfterMs : null,
        output: run.output,
      });
      break;
    default:
      dropped.push(m.type);
  }
});

function sendStdin(runId, reqId, value) {
  run_echo(value + "\n");
  frame.contentWindow.postMessage({ type: "stdin", runId, reqId, value: String(value) }, RUN_ORIGIN);
}
function run_echo(text) { out.textContent += text; }

ask.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!askingFor) return;
  sendStdin(askingFor.runId, askingFor.reqId, answer.value);
  askingFor = null;
  answer.value = "";
  ask.hidden = true;
});

function run(code, { inputs = [], mode = "run" } = {}) {
  const runId = `r${++seq}`;
  out.textContent = "";
  return new Promise((resolve) => {
    runs.set(runId, {
      output: "",
      inputs: inputs.map((x) => (typeof x === "object" ? x : { value: x })),
      resolve,
    });
    frame.contentWindow.postMessage({ type: "run", runId, code, mode }, RUN_ORIGIN);
  });
}

function stop() { frame.contentWindow.postMessage({ type: "stop" }, RUN_ORIGIN); }
function config(cfg) { frame.contentWindow.postMessage({ type: "config", ...cfg }, RUN_ORIGIN); }

document.getElementById("run").addEventListener("click", () => run(document.getElementById("code").value));
document.getElementById("stop").addEventListener("click", stop);

// Test hook for the Playwright harness.
const secretsPlanted = (async () => {
await new Promise((resolve, reject) => {
  const req = indexedDB.open("app-db", 1);
  req.onupgradeneeded = () => req.result.createObjectStore("secrets");
  req.onsuccess = () => {
    const tx = req.result.transaction("secrets", "readwrite");
    tx.objectStore("secrets").put("S3CRET-IDB", "token");
    tx.oncomplete = () => { req.result.close(); resolve(); };
    tx.onerror = () => reject(tx.error);
  };
  req.onerror = () => reject(req.error);
});
})();
window.api = { ready: Promise.all([ready, secretsPlanted]).then(([r]) => r), run, stop, config, dropped, outElementChildCount: () => out.children.length };
