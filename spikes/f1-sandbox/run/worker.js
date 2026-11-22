// Python worker (module worker on the sandbox site). Untrusted user code runs here.
import { loadPyodide } from "/pyodide/pyodide.mjs";

let runId = null;
let stdinMode = "prefill";
const outDec = new TextDecoder();
const errDec = new TextDecoder();

// COI-free blocking input(): a synchronous XHR that the service worker holds open.
function syncStdin() {
  if (stdinMode !== "sync-sw") return null; // EOF -> EOFError in Python
  const reqId = crypto.randomUUID();
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
  py = await loadPyodide({ indexURL: "/pyodide/" });
  py.setStdout({ write: (buf) => { postMessage({ type: "stdout", runId, text: outDec.decode(buf, { stream: true }) }); return buf.length; } });
  py.setStderr({ write: (buf) => { postMessage({ type: "stderr", runId, text: errDec.decode(buf, { stream: true }) }); return buf.length; } });
  py.setStdin({ stdin: syncStdin });
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
  try {
    if (m.mode === "explain" && !wheelsLoaded) {
      const base = self.location.origin + "/wheels/";
      await py.loadPackage(["executing-2.3.0", "asttokens-3.0.2", "pure_eval-0.2.4", "stack_data-0.6.3"].map((w) => `${base}${w}-py3-none-any.whl`));
      wheelsLoaded = true;
    }
    const res = await ns.get("run_user")(m.code, m.mode);
    const [status, error, extra] = res.toJs();
    res.destroy();
    postMessage({ type: "result", runId, status, error, extra });
  } catch (err) {
    // The Python side itself is broken (e.g. user sabotaged our helpers) -> host must recycle.
    postMessage({ type: "result", runId, status: "error", error: `worker-corrupted: ${String(err && err.message || err)}` });
  }
};
