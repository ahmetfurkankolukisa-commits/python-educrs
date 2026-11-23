import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { editorReady, editorText, modKey, setCode } from "./helpers.ts";

const RUN = "http://127.0.0.1:4322";
const EVIL = "http://127.0.0.1:4323";

async function ready(page: Page) {
  await page.goto("/");
  // "Try it now" loads when it scrolls into view (client:visible); on a phone it is below the fold.
  await page.getByTestId("runner-status").scrollIntoViewIfNeeded();
  await expect(page.getByTestId("runner-status")).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
}

/** Type code into the real editor, press Run, answer input() prompts, return the output text. */
async function run(page: Page, code: string, inputs: string[] = []) {
  await setCode(page, code);
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
  await page.getByTestId("runner-status").scrollIntoViewIfNeeded(); // loads when visible (client:visible)
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
  await setCode(page, "while True:\n    pass");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByTestId("runner-status")).toHaveAttribute("data-status", "running");
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.getByTestId("runner-output")).toContainText("Stopped.");
  expect(await run(page, 'print("after")')).toBe("after\n");
});

test("a runaway print loop: the output is cut off with a note, and Stop still says so", async ({ page }) => {
  await ready(page);
  await setCode(page, 'while True:\n    print("x" * 1000)');
  await page.getByRole("button", { name: "Run" }).click();
  const out = page.getByTestId("runner-output");
  await expect(out).toContainText("the output is too long", { timeout: 30_000 });
  await page.getByRole("button", { name: "Stop" }).click();
  // The cap must not swallow the status line: this is when a learner presses Stop the most.
  await expect(out).toContainText("Stopped.");
  const text = (await out.textContent()) ?? "";
  expect(text.length).toBeLessThan(100_000 + 200);
  expect(text.trimEnd().endsWith("Stopped.")).toBe(true);
  expect(await run(page, 'print("after")')).toBe("after\n"); // a new run starts clean
});

test("a long, fast output arrives complete and in order (it is batched after the first burst)", async ({ page }) => {
  await ready(page);
  const out = await run(page, 'for i in range(3000):\n    print(i)\nprint("end")');
  const lines = out.trimEnd().split("\n");
  expect(lines).toHaveLength(3001);
  expect(lines.slice(0, 3)).toEqual(["0", "1", "2"]);
  expect(lines.slice(-2)).toEqual(["2999", "end"]);
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

test("the editor's text is at least 16px (iOS Safari zooms smaller fields on focus)", async ({ page }) => {
  await ready(page);
  await editorReady(page);
  const size = await page.locator(".cm-content").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(size).toBeGreaterThanOrEqual(16);
});

test.describe("code editor (F3.4)", () => {
  test("is actually styled by its theme (strict CSP must not strip CodeMirror's styles)", async ({ page }) => {
    await ready(page);
    await editorReady(page);
    const style = await page.locator(".cm-editor").evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        radius: cs.borderTopLeftRadius,
        token: getComputedStyle(document.documentElement).getPropertyValue("--radius-md").trim(),
        font: getComputedStyle(el.querySelector(".cm-scroller")!).fontFamily,
        position: cs.position,
      };
    });
    expect(style.radius).toBe(style.token); // --radius-md from our theme, whatever its value
    expect(style.token).not.toBe("");
    expect(style.font).toMatch(/mono|Menlo|monospace/i);
    expect(style.position).toBe("relative"); // CodeMirror's own base theme
  });

  test("highlights the line an error points at, and clears it on edit", async ({ page }) => {
    await ready(page);
    await run(page, 'name = "Ada"\nprint(nmae)');
    await expect(page.locator(".cm-line.cm-error-line")).toHaveText("print(nmae)");
    const bg = await page.locator(".cm-line.cm-error-line").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)"); // the highlight is visible, not just a class name
    await page.locator(".cm-content").click();
    await page.keyboard.insertText(" ");
    await expect(page.locator(".cm-error-line")).toHaveCount(0);
  });

  test("Ctrl/Cmd+Enter runs the program", async ({ page }) => {
    await ready(page);
    await setCode(page, 'print("shortcut")');
    await page.keyboard.press(`${await modKey(page)}+Enter`);
    await expect(page.getByTestId("runner-output")).toHaveText("shortcut\n");
  });

  test("symbol bar inserts paired characters and keeps the cursor inside (touch devices)", async ({ page }, info) => {
    test.skip(!info.project.use.hasTouch, "the symbol bar only appears on touch devices");
    await ready(page);
    await setCode(page, "");
    await page.keyboard.insertText("print");
    await page.getByRole("button", { name: "Insert round brackets" }).tap();
    await page.getByRole("button", { name: "Insert double quotes" }).tap();
    await page.keyboard.insertText("hi");
    await expect.poll(() => editorText(page)).toBe('print("hi")');
    // focus stays in the editor (it lives in a shadow root, so look inside it)
    expect(await page.evaluate(() => !!document.activeElement?.shadowRoot?.activeElement?.closest(".cm-editor"))).toBe(true);
    await page.getByRole("button", { name: "Run" }).tap();
    await expect(page.getByTestId("runner-output")).toHaveText("hi\n");
  });

  test("no symbol bar on devices with a mouse", async ({ page }, info) => {
    test.skip(!!info.project.use.hasTouch, "touch devices show the bar");
    await ready(page);
    await editorReady(page);
    await expect(page.getByTestId("symbol-bar")).toHaveCount(0);
  });
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
