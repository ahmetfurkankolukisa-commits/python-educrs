// Debug helper: boot one engine, print sandbox console + probe/module-patch results step by step.
import { chromium, firefox, webkit } from "playwright";
import { start, APP_ORIGIN } from "./server.mjs";
const ENGINES = { chromium, firefox, webkit };
const name = process.argv[2] || "webkit";
const srv = await start();
const browser = await ENGINES[name].launch();
const page = await (await browser.newContext()).newPage();
page.on("console", (m) => console.log(`[console:${m.type()}]`, m.text().slice(0, 300)));
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
const step = async (label, fn, ms = 20000) => {
  const t = Date.now();
  try {
    const v = await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT")), ms))]);
    console.log(`${label} (${Date.now() - t}ms):`, JSON.stringify(v).slice(0, 500));
  } catch (e) { console.log(`${label} FAILED (${Date.now() - t}ms):`, String(e).slice(0, 300)); }
};
await page.goto(`${APP_ORIGIN}/index.html`);
await step("api", () => page.waitForFunction(() => window.api).then(() => true));
await step("ready", () => page.evaluate(() => window.api.ready), 60000);
await step("hello", () => page.evaluate(() => window.api.run('print("hello")')));
await step("probe", () => page.evaluate(() => window.api.run("", { mode: "probe" })));
await step("patch", () => page.evaluate(() => window.api.run("import json\njson.dumps = None")));
await step("probe2", () => page.evaluate(() => window.api.run("", { mode: "probe" })));
await step("check", () => page.evaluate(() => window.api.run("import json\nprint(json.dumps([1]))")));
await step("input", () => page.evaluate(() => window.api.run('n = input()\nprint("got", n)', { inputs: ["x"] })));
await browser.close();
await srv.close();
