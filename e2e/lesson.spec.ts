import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setCode } from "./helpers.ts";

// Step-by-step lessons and the learning path (docs/05-f3-mvp0.md §13, map §14).
// Every test starts with a fresh browser context, so a fresh IndexedDB: a brand-new learner.

const VARS_USE = "/learn/m2/vars-use/";
const PATH = "/learn/";

const step = (page: Page) => page.getByTestId("lesson-step");
const feedback = (page: Page) => page.getByTestId("feedback");
const choice = (page: Page, value: string) => page.locator(`[data-choice="${value.replace(/"/g, '\\"')}"]`);

async function openLesson(page: Page, url = VARS_USE) {
  await page.goto(url);
  await expect(page.getByTestId("lesson")).toHaveAttribute("data-ready", "true");
}

async function expectStep(page: Page, kind: string) {
  await expect(step(page)).toHaveAttribute("data-kind", kind);
}

/** Check, expect a tone, then press the panel's one big button. */
async function checkExpect(page: Page, tone: string) {
  await page.getByTestId("check").click();
  await expect(feedback(page)).toHaveAttribute("data-tone", tone, { timeout: 70_000 });
}

async function seriousViolations(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  return r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

async function sandboxReady(page: Page) {
  await expect(page.getByTestId("runner-status")).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
}

test.describe("learning path", () => {
  test("a new learner: the first lesson is next, the rest not started, every node is a link", async ({ page }) => {
    await page.goto(PATH);
    await expect(page.getByTestId("path")).toHaveAttribute("data-loaded", "true");
    const nodes = page.getByTestId("path-node");
    await expect(nodes).toHaveCount(2);
    await expect(nodes.nth(0)).toHaveAttribute("data-state", "next");
    await expect(nodes.nth(1)).toHaveAttribute("data-state", "todo");
    await expect(nodes.nth(0)).toHaveAttribute("href", VARS_USE);
    await expect(nodes.nth(1)).toHaveAttribute("href", "/learn/m2/vars-reassign/");
  });

  test("the home page links to the path", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("start-learning").click();
    await expect(page).toHaveURL(PATH);
  });
});

test.describe("a whole lesson", () => {
  test("every step type, a wrong answer first each time (no penalty), then completion and the path moves on", async ({ page }) => {
    test.setTimeout(240_000);
    await openLesson(page);

    // 1. explain
    await expectStep(page, "explain");
    await page.getByTestId("continue").click();

    // 2. predict-output: a tagged wrong option → "Common mix-up" with its own message
    await expectStep(page, "predict-output");
    await page.getByTestId("check").click();
    await expect(page.getByRole("alert")).toHaveText("Pick an answer first."); // nothing picked: not an attempt
    await choice(page, "first last").click();
    await checkExpect(page, "mixup");
    await expect(feedback(page)).toContainText("variable names");
    await page.getByTestId("feedback-primary").click(); // Try again
    await choice(page, "Ada Lovelace").click();
    await checkExpect(page, "correct");
    await page.getByTestId("feedback-primary").click(); // Continue

    // 3. fill-gap: a tile that raises → the explainer's words, computed by the content pipeline
    await expectStep(page, "fill-gap");
    await choice(page, "Name").click();
    await expect(page.getByTestId("gap")).toHaveText("Name");
    await checkExpect(page, "wrong");
    await expect(feedback(page)).toContainText("capital letters");
    await page.getByTestId("feedback-primary").click();
    await choice(page, "name").click();
    await checkExpect(page, "correct");
    await page.getByTestId("feedback-primary").click();

    // 4. verbatim (graded by the sandbox in a fresh worker)
    await expectStep(page, "verbatim");
    await sandboxReady(page);
    await setCode(page, 'city = "Lisbon"\nprint("I live in", "Lisbon")');
    await checkExpect(page, "wrong");
    await expect(feedback(page)).toContainText("character by character");
    await page.getByTestId("feedback-primary").click();
    await setCode(page, 'city = "Lisbon"\nprint("I live in", city)');
    await checkExpect(page, "correct");
    await page.getByTestId("feedback-primary").click();

    // 5. code: the misconception is recognised by behaviour; expected vs actual shown side by side
    await expectStep(page, "code");
    await sandboxReady(page);
    await page.getByRole("button", { name: "Hint 1 of 2" }).click();
    await expect(page.getByTestId("hints")).toContainText("already stored");
    await setCode(page, 'name = "Ada"\nprint("Hello,", "name")');
    await checkExpect(page, "mixup");
    await expect(page.getByTestId("feedback-compare")).toContainText("Hello, name");
    await page.getByTestId("feedback-primary").click();
    await setCode(page, 'name = "Ada"\nprint("Hello,", name)');
    await checkExpect(page, "correct");
    await page.getByTestId("feedback-primary").click();

    // completion: wrong answers never cost anything; first-try is only reported here
    await expect(page.getByTestId("lesson-complete")).toBeVisible();
    await expect(page.getByTestId("lesson-complete")).toContainText("0 of 4 right on the first try");
    await expect(page.getByTestId("lesson-progress")).toHaveAttribute("aria-valuenow", "5");
    await page.getByRole("link", { name: "Back to the path" }).click();

    await expect(page.getByTestId("path")).toHaveAttribute("data-loaded", "true");
    const nodes = page.getByTestId("path-node");
    await expect(nodes.nth(0)).toHaveAttribute("data-state", "completed");
    await expect(nodes.nth(1)).toHaveAttribute("data-state", "next");
  });

  test("the keyboard alone is enough: Enter, number keys, and focus moves to each new card", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard flow is a desktop concern; phones are covered by the tap flow");
    await openLesson(page);
    await page.keyboard.press("Enter"); // Continue on the explain card
    await expectStep(page, "predict-output");
    await expect(page.locator("h1")).toBeFocused();
    await page.keyboard.press("1");
    await expect(page.getByRole("radio", { name: "Ada Lovelace" })).toBeChecked();
    await page.keyboard.press("Enter"); // Check
    await expect(feedback(page)).toHaveAttribute("data-tone", "correct");
    await expect(page.getByTestId("feedback-primary")).toBeFocused();
    await page.keyboard.press("Enter"); // Continue
    await expectStep(page, "fill-gap");
    await expect(page.locator("h1")).toBeFocused();
    await page.keyboard.press("2");
    await page.keyboard.press("Enter");
    await expect(feedback(page)).toHaveAttribute("data-tone", "mixup");
    await page.keyboard.press("Enter"); // Try again
    await expect(feedback(page)).toHaveCount(0);
    await page.keyboard.press("1");
    await page.keyboard.press("Enter");
    await expect(feedback(page)).toHaveAttribute("data-tone", "correct");
    await expect(page.getByTestId("announce")).toContainText("Correct!");
  });

  test("after two wrong tries 'Show me' reveals the answer, so nobody gets stuck", async ({ page }) => {
    await openLesson(page);
    await page.getByTestId("continue").click();
    for (const wrong of ["AdaLovelace", "Error"]) {
      await choice(page, wrong).click();
      await checkExpect(page, "wrong");
      if (wrong === "AdaLovelace") {
        await expect(page.getByRole("button", { name: "Show me" })).toHaveCount(0); // not after one try
        await page.getByTestId("feedback-primary").click();
      }
    }
    await feedback(page).getByRole("button", { name: "Show me" }).click();
    await expect(choice(page, "Ada Lovelace")).toContainText("✓");
    await expect(page.getByRole("radio", { name: /Ada Lovelace/ })).toBeChecked();
    await checkExpect(page, "correct");
  });

  test("leaving mid-lesson and coming back continues at the same step", async ({ page }) => {
    await openLesson(page);
    await page.getByTestId("continue").click();
    await choice(page, "Ada Lovelace").click();
    await checkExpect(page, "correct");
    await page.getByTestId("feedback-primary").click();
    await expectStep(page, "fill-gap");

    await page.getByTestId("lesson-exit").click();
    await expect(page).toHaveURL(PATH);
    await expect(page.getByTestId("path")).toHaveAttribute("data-loaded", "true");
    const first = page.getByTestId("path-node").nth(0);
    await expect(first).toHaveAttribute("data-state", "next");
    await expect(first).toContainText("Continue");

    await first.click();
    await expect(page.getByTestId("lesson")).toHaveAttribute("data-ready", "true");
    await expectStep(page, "fill-gap");
    await expect(page.getByTestId("lesson-progress")).toHaveAttribute("aria-valuenow", "2");
  });
});

test.describe("lesson page quality", () => {
  test("no CSP violations on the path and lesson pages", async ({ page }) => {
    const cspErrors: string[] = [];
    page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) cspErrors.push(m.text()); });
    await page.goto(PATH);
    await expect(page.getByTestId("path")).toHaveAttribute("data-loaded", "true");
    await openLesson(page);
    await page.getByTestId("continue").click();
    await choice(page, "first last").click();
    await checkExpect(page, "mixup");
    expect(cspErrors).toEqual([]);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`no serious accessibility violations with the feedback panel open (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await openLesson(page);
      await page.getByTestId("continue").click();
      await choice(page, "first last").click();
      await checkExpect(page, "mixup");
      expect(await seriousViolations(page)).toEqual([]);
    });

    test(`no serious accessibility violations on the learning path (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.goto(PATH);
      // waitForSelector, not expect().toHaveAttribute(): with the polling assertion, axe right after
      // it crashed headless Firefox's content process (SIGSEGV after "RenderCompositorSWGL failed
      // mapping default framebuffer") in about every other test, under the test runner only; with
      // waitForSelector it never did (19/19, F3.5). A browser crash, not a page error — the same
      // page passes axe in Chromium, WebKit and the iPhone project, and in Storybook.
      await page.waitForSelector('[data-testid="path"][data-loaded="true"]');
      expect(await seriousViolations(page)).toEqual([]);
    });
  }
});
