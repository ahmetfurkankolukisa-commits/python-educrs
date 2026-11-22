import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const RUN = "http://127.0.0.1:4322";
const EVIL = "http://127.0.0.1:4323";

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("runner-status")).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
}

/** Type code into the real editor, press Run, answer input() prompts, return the output text. */
async function run(page: Page, code: string, inputs: string[] = []) {
  await page.locator("#code").fill(code);
  await page.getByRole("button", { name: "Run" }).click();
  for (const value of inputs) {
    await page.locator("#stdin").fill(value);
    await page.locator("#stdin").press("Enter");
  }
  await expect(page.getByTestId("runner-status")).toHaveAttribute("data-status", "ready");
  return (await page.getByTestId("runner-output").textContent()) ?? "";
}

test.beforeAll(async ({ request }) => {
  const info = await (await request.get(`${RUN}/build-info.json`)).json();
  expect(info.appOrigin, "run build must target the local app — use `pnpm build:e2e`").toBe("http://localhost:4321");
});

test("boots with strict headers, noindex and no CSP violations", async ({ page }) => {
  const cspErrors: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) cspErrors.push(m.text()); });
  const res = await page.goto("/");
  expect(res?.headers()["x-robots-tag"]).toContain("noindex");
  expect(res?.headers()["content-security-policy"]).toContain(`frame-src ${RUN}`);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByTestId("runner-status")).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  expect(cspErrors).toEqual([]);
});

test("runs print and input()", async ({ page }) => {
  await ready(page);
  expect(await run(page, 'print("hello")')).toBe("hello\n");
  expect(await run(page, 'name = input("Name? ")\nprint("Hi", name)', ["Ada"])).toContain("Hi Ada");
});

test("stops an infinite loop and keeps working", async ({ page }) => {
  await ready(page);
  await page.locator("#code").fill("while True:\n    pass");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByTestId("runner-status")).toHaveAttribute("data-status", "running");
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByTestId("runner-output")).toContainText("Stopped.");
  expect(await run(page, 'print("after")')).toBe("after\n");
});

test("user code cannot read the app's storage", async ({ page }) => {
  await ready(page);
  await page.evaluate(() => new Promise<void>((resolve) => {
    localStorage.setItem("secret", "S3CRET");
    const r = indexedDB.open("app-db", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("s");
    r.onsuccess = () => { r.result.close(); resolve(); };
  }));
  const out = await run(page, `
import js, asyncio
from pyodide.ffi import create_once_callable
print("HAS_LOCALSTORAGE", hasattr(js, "localStorage"))
fut = asyncio.get_event_loop().create_future()
req = js.indexedDB.open("app-db")
def up(e):
    if not fut.done(): fut.set_result("NEW-EMPTY")
def ok(e):
    if not fut.done(): fut.set_result("EXISTING")
req.onupgradeneeded = create_once_callable(up)
req.onsuccess = create_once_callable(ok)
print("APPDB", await fut)
`);
  expect(out).toContain("HAS_LOCALSTORAGE False");
  expect(out).toContain("APPDB NEW-EMPTY");
});

test("user code cannot reach the network", async ({ page, request }) => {
  await ready(page);
  const before = (await (await request.get(`${EVIL}/__hits`)).json()).length;
  const out = await run(page, `
import js, asyncio
async def get(u):
    return await js.fetch(u)
try:
    await asyncio.wait_for(get("${EVIL}/fetch"), 3); print("FETCH OK")
except Exception:
    print("FETCH BLOCKED")
for name, fn in [("xhr", lambda: (lambda x: (x.open("GET", "${EVIL}/xhr", False), x.send()))(js.XMLHttpRequest.new())),
                 ("ws", lambda: js.WebSocket.new("ws://127.0.0.1:4323/ws")),
                 ("eval", lambda: js.eval("1+1"))]:
    try:
        fn(); print(name.upper(), "OK")
    except Exception:
        print(name.upper(), "BLOCKED")
`);
  await page.waitForTimeout(1000);
  const after = (await (await request.get(`${EVIL}/__hits`)).json()).length;
  expect(out).toContain("FETCH BLOCKED");
  expect(out).toContain("XHR BLOCKED");
  // Chromium blocks a CSP-violating WebSocket asynchronously instead of throwing in the
  // constructor, so "WS OK" can appear. The property that matters is checked below:
  // nothing ever reaches the attacker.
  expect(out).toMatch(/WS (OK|BLOCKED)/);
  expect(out).toContain("EVAL BLOCKED");
  expect(after - before, "requests that reached the attacker").toBe(0);
});

test("program output is shown as text, never as HTML", async ({ page }) => {
  await ready(page);
  const dialogs: string[] = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); void d.dismiss(); });
  const out = await run(page, 'print("<img src=x onerror=alert(1)><b>bold</b>")');
  expect(out).toContain("<img src=x onerror=alert(1)>");
  await expect(page.getByTestId("runner-output").locator("*")).toHaveCount(0);
  expect(dialogs).toEqual([]);
});

test("other sites cannot embed the sandbox", async ({ page }) => {
  await page.goto(`${EVIL}/embed.html`);
  await page.waitForTimeout(5000);
  expect(await page.evaluate(() => (window as unknown as { gotReady: boolean }).gotReady)).toBe(false);
});

test.describe("errors are explained in plain English (F3.3)", () => {
  const cases: [string, string, RegExp, number][] = [
    ["text without quotes", "print(Hello)", /put it in quotes/, 1],
    ["capital letter", 'Print("hi")', /capital letters: Print is not the same as print/, 1],
    ["typo", 'name = "Ada"\nprint(nmae)', /Did you mean name\?/, 2],
    ["smart quotes", "print(\u201cHi\u201d)", /smart quotes/, 1],
    ["unterminated text", 'print("Hi)', /never ends/, 1],
  ];
  for (const [label, code, expected, line] of cases) {
    test(label, async ({ page }) => {
      await ready(page);
      await run(page, code);
      const box = page.getByTestId("runner-explanation");
      await expect(box).toContainText(expected);
      await expect(box).toContainText(`What went wrong · line ${line}`);
    });
  }

  test("the explanation disappears on the next successful run", async ({ page }) => {
    await ready(page);
    await run(page, "print(Hello)");
    await expect(page.getByTestId("runner-explanation")).toBeVisible();
    await run(page, 'print("Hello")');
    await expect(page.getByTestId("runner-explanation")).toHaveCount(0);
  });
});

test("form fields are at least 16px on small screens (iOS Safari zooms smaller fields on focus)", async ({ page }) => {
  await ready(page);
  const width = page.viewportSize()?.width ?? 1280;
  test.skip(width >= 640, "desktop layout may use smaller text");
  const size = await page.locator("#code").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`has no serious accessibility violations (${colorScheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await ready(page);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.length} node(s)`)).toEqual([]);
  });
}
