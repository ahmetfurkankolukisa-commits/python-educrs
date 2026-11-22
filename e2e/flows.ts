import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { setCode } from "./helpers.ts";

// Whole lessons answered right the first time, for tests that care about what comes after
// (rewards, streaks, plain mode). lesson.spec.ts covers the wrong answers and the flow itself.

export const VARS_USE = "/learn/m2/vars-use/";
export const VARS_REASSIGN = "/learn/m2/vars-reassign/";
export const PATH = "/learn/";
export const SETTINGS = "/settings/";

export const choice = (page: Page, value: string) => page.locator(`[data-choice="${value.replace(/"/g, '\\"')}"]`);

export async function openLesson(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByTestId("lesson")).toHaveAttribute("data-ready", "true");
}

async function step(page: Page, kind: string) {
  await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-kind", kind);
}

/** Check, expect "Correct!", Continue. */
async function right(page: Page) {
  await page.getByTestId("check").click();
  await expect(page.getByTestId("feedback")).toHaveAttribute("data-tone", "correct", { timeout: 70_000 });
  await page.getByTestId("feedback-primary").click();
}

async function code(page: Page, program: string) {
  await expect(page.getByTestId("runner-status")).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  await setCode(page, program);
  await right(page);
}

/** vars.use: 4 easy exercises, no hints → 4 × 10 + 5 = 45 XP (docs/05-f3-mvp0.md §15.2). */
export async function finishVarsUse(page: Page) {
  await openLesson(page, VARS_USE);
  await step(page, "explain");
  await page.getByTestId("continue").click();
  await step(page, "predict-output");
  await choice(page, "Ada Lovelace").click();
  await right(page);
  await step(page, "fill-gap");
  await choice(page, "name").click();
  await right(page);
  await step(page, "verbatim");
  await code(page, 'city = "Lisbon"\nprint("I live in", city)');
  await step(page, "code");
  await code(page, 'name = "Ada"\nprint("Hello,", name)');
  await expect(page.getByTestId("lesson-complete")).toBeVisible();
}

/** vars.reassign: easy fill-gap + medium predict + easy code → 10 + 15 + 10 + 5 = 40 XP. */
export async function finishVarsReassign(page: Page) {
  await openLesson(page, VARS_REASSIGN);
  await step(page, "explain");
  await page.getByTestId("continue").click();
  await step(page, "fill-gap");
  await choice(page, '"blue"').click();
  await right(page);
  await step(page, "predict-output");
  await choice(page, "cat").click();
  await right(page);
  await step(page, "code");
  await code(page, 'pet = "cat"\nnew_pet = "dog"\nprint(pet)\npet = new_pet\nprint(pet)');
  await expect(page.getByTestId("lesson-complete")).toBeVisible();
}

/** The learning path, once the learner's events have been read. */
export async function openPath(page: Page) {
  await page.goto(PATH);
  // waitForSelector, not a polling expect: see the Firefox note in lesson.spec.ts.
  await page.waitForSelector('[data-testid="path"][data-loaded="true"]');
}

export async function openSettings(page: Page) {
  await page.goto(SETTINGS);
  await page.waitForSelector('[data-testid="settings"][data-ready="true"]');
}

export async function seriousViolations(page: Page): Promise<string[]> {
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  return r.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}
