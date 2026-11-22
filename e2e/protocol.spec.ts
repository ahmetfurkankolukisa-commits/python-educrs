import { expect, test, type Page } from "@playwright/test";

// Sandbox protocol v1 (docs/05-f3-mvp0.md §6) and grading in a fresh worker (§3.1).
const RUN = "http://127.0.0.1:4322";
const PREVIEW = "http://localhost:4325";
const SPOOF = "http://localhost:4326";

async function ready(page: Page, url = "/") {
  await page.goto(url);
  await expect(page.getByTestId("runner-status")).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
}

async function run(page: Page, code: string) {
  await page.locator("#code").fill(code);
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByTestId("runner-status")).toHaveAttribute("data-status", "ready");
  return (await page.getByTestId("runner-output").textContent()) ?? "";
}

type CheckResult = { status: string; error: string | null; extra: string | null };

/** Send a `check` straight to the sandbox iframe from the app page, the way lesson pages will. */
async function check(page: Page, code: string, spec: object, seed = 7): Promise<CheckResult & { grade: Record<string, unknown> | null }> {
  const r = await page.evaluate(
    ([c, s, seedValue, origin]) =>
      new Promise<CheckResult>((resolve) => {
        const frame = document.querySelector("iframe") as HTMLIFrameElement;
        const runId = `c${Math.random().toString(36).slice(2)}`;
        const onMsg = (e: MessageEvent) => {
          if (e.origin !== origin || e.data?.type !== "result" || e.data.runId !== runId) return;
          window.removeEventListener("message", onMsg);
          resolve({ status: e.data.status, error: e.data.error, extra: e.data.extra });
        };
        window.addEventListener("message", onMsg);
        frame.contentWindow!.postMessage({ type: "check", runId, code: c, spec: s, seed: seedValue }, origin as string);
      }),
    [code, JSON.stringify(spec), seed, RUN] as const,
  );
  return { ...r, grade: r.extra ? JSON.parse(r.extra) : null };
}

const HELLO = { kind: "stdout", expected: "hello\n" };

test.describe("handshake + origin allowlist", () => {
  test("an allowed preview origin can use the sandbox", async ({ page }) => {
    await ready(page, PREVIEW);
    expect(await run(page, 'print("from preview")')).toBe("from preview\n");
  });

  test("an origin outside the allowlist is ignored, even though it may embed the sandbox", async ({ page }) => {
    await page.goto(SPOOF);
    // The iframe loads (frame-ancestors allows it) but the handshake is never answered.
    await page.waitForTimeout(8000);
    await expect(page.getByTestId("runner-status")).toHaveAttribute("data-status", "loading");
    const sandboxLoaded = page.frames().some((f) => f.url().startsWith(RUN));
    expect(sandboxLoaded, "sandbox iframe should load for this test to mean anything").toBe(true);
  });

  test("messages from a second origin are ignored after the first one is locked", async ({ page, context }) => {
    await ready(page);
    // A spoof page tries to drive the same sandbox URL; it gets its own iframe and is never acked.
    const spoof = await context.newPage();
    await spoof.goto(SPOOF);
    await spoof.waitForTimeout(3000);
    await expect(spoof.getByTestId("runner-status")).toHaveAttribute("data-status", "loading");
    // The legitimate app is unaffected.
    expect(await run(page, 'print("still mine")')).toBe("still mine\n");
  });
});

test.describe("grading runs in a fresh worker", () => {
  test("grades correct and incorrect programs", async ({ page }) => {
    await ready(page);
    const ok = await check(page, 'print("hello")', HELLO);
    expect(ok.status).toBe("ok");
    expect(ok.grade).toMatchObject({ passed: true, seed: 7 });
    const bad = await check(page, 'print("bye")', HELLO);
    expect(bad.grade).toMatchObject({ passed: false, actual: "bye\n", expected: "hello\n" });
  });

  test("every check gets a brand-new interpreter, whatever ran before", async ({ page }) => {
    await ready(page);
    // Several runs in the active worker, including one that tampers with builtins.
    await run(page, 'import builtins\nbuiltins.print = lambda *a, **k: None');
    await run(page, 'x = 1');
    for (let i = 0; i < 3; i++) {
      const r = await check(page, 'print("hello")', HELLO);
      expect(r.grade, `check #${i + 1}`).toMatchObject({ passed: true, worker_runs: 1 });
    }
  });

  test("sabotaging the interpreter during Run cannot fake a grade", async ({ page }) => {
    await ready(page);
    // Corrupt the sandbox helpers in the ACTIVE worker…
    await run(page, 'import gc\nfor o in gc.get_objects():\n    if isinstance(o, dict) and "run_user" in o and "_restore" in o:\n        o["run_user"] = None');
    // …the grade still comes from a clean interpreter.
    const r = await check(page, 'print("bye")', HELLO);
    expect(r.grade).toMatchObject({ passed: false, worker_runs: 1 });
  });

  test("a check that never ends times out and the next check still works", async ({ page }) => {
    test.setTimeout(60_000);
    await ready(page);
    const hang = await check(page, "while True:\n    pass", HELLO);
    expect(hang.status).toBe("timeout");
    const next = await check(page, 'print("hello")', HELLO);
    expect(next.grade).toMatchObject({ passed: true, worker_runs: 1 });
  });

  test("Run keeps working after checks (the active worker is untouched)", async ({ page }) => {
    await ready(page);
    await check(page, 'print("hello")', HELLO);
    expect(await run(page, 'print("run after check")')).toBe("run after check\n");
  });

  test("input() during a check ends with an error instead of waiting forever", async ({ page }) => {
    await ready(page);
    const r = await check(page, 'name = input()\nprint(name)', HELLO);
    expect(r.grade?.passed).toBe(false);
    expect(String(r.grade?.error)).toContain("EOFError");
  });
});
