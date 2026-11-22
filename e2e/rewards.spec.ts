import fs from "node:fs";
import { expect, test } from "@playwright/test";
import {
  PATH, VARS_USE, choice, finishVarsReassign, finishVarsUse, openLesson, openPath, openSettings, seriousViolations,
} from "./flows.ts";

// XP, daily goal, streak, plain mode and "download my data" (docs/05-f3-mvp0.md §15).
// Every test starts with a fresh browser context, so a fresh IndexedDB: a brand-new learner.

test.describe("rewards", () => {
  test("a first lesson: +55 XP, the goal reached, a 1-day streak, then the goal question; it all survives a reload", async ({ page }) => {
    test.setTimeout(240_000);
    await finishVarsUse(page);

    await expect(page.getByTestId("reward-xp")).toHaveText("+55 XP");
    const goal = page.getByTestId("reward-goal");
    await expect(goal).toHaveAttribute("data-met", "true");
    await expect(goal).toContainText("Daily goal reached!");
    await expect(goal).toHaveClass(/celebrate/);
    // the small burst of sparks around the badge (direction A, §17.6) is drawn…
    expect(await page.locator(".sparks").evaluate((el) => getComputedStyle(el).display)).not.toBe("none");
    await expect(page.getByTestId("reward-streak")).toHaveAttribute("data-days", "1");

    const question = page.getByTestId("goal-question");
    await expect(question).toBeVisible();
    await expect(question.getByRole("radio", { checked: true })).toHaveCount(0); // nothing pre-selected
    expect(await seriousViolations(page)).toEqual([]);
    await question.locator('[data-goal="30"]').click();
    await expect(page.getByTestId("goal-saved")).toHaveText("Daily goal saved: 30 XP a day.");
    // A higher goal starts tomorrow: today still counts against 20, so it stays reached.
    await expect(goal).toHaveAttribute("data-met", "true");

    await page.getByRole("link", { name: "Back to the path" }).click();
    await page.waitForSelector('[data-testid="path"][data-loaded="true"]');
    const check = async () => {
      await expect(page.getByTestId("stat-streak")).toHaveAttribute("data-days", "1");
      await expect(page.getByTestId("stat-streak")).toHaveAttribute("data-lit", "true");
      await expect(page.getByTestId("stat-xp")).toHaveAttribute("data-xp", "55");
      await expect(page.getByTestId("stat-goal").getByTestId("goal-ring")).toHaveAttribute("data-goal", "20");
    };
    await check();
    await page.reload();
    await page.waitForSelector('[data-testid="path"][data-loaded="true"]');
    await check();

    // The question is asked until a goal is chosen — and not again after that.
    await finishVarsReassign(page);
    await expect(page.getByTestId("reward-xp")).toHaveText("+60 XP");
    await expect(page.getByTestId("goal-question")).toHaveCount(0);
  });

  test.describe("over two days", () => {
    test.use({ timezoneId: "Europe/Istanbul" }); // UTC+3 all year: the day boundary is known

    test("the streak shows yesterday's 1 (not lit) until today's goal is reached, then 2", async ({ page }) => {
      test.setTimeout(300_000);
      await page.clock.setFixedTime(new Date("2026-11-20T10:00:00+03:00"));
      await finishVarsUse(page);
      await expect(page.getByTestId("reward-streak")).toHaveAttribute("data-days", "1");

      await page.clock.setFixedTime(new Date("2026-11-21T09:00:00+03:00"));
      await openPath(page);
      await expect(page.getByTestId("stat-streak")).toHaveAttribute("data-days", "1");
      await expect(page.getByTestId("stat-streak")).toHaveAttribute("data-lit", "false");
      await expect(page.getByTestId("stat-xp")).toHaveAttribute("data-xp", "55");
      await expect(page.getByTestId("stat-goal").getByTestId("goal-ring")).toHaveAttribute("data-value", "0");

      await page.emulateMedia({ reducedMotion: "reduce" });
      await finishVarsReassign(page);
      await expect(page.getByTestId("reward-xp")).toHaveText("+60 XP");
      await expect(page.getByTestId("reward-streak")).toHaveAttribute("data-days", "2");
      // …but not for someone who asked for less motion
      expect(await page.locator(".sparks").evaluate((el) => getComputedStyle(el).display)).toBe("none");
      await openPath(page);
      await expect(page.getByTestId("stat-streak")).toHaveAttribute("data-days", "2");
      await expect(page.getByTestId("stat-streak")).toHaveAttribute("data-lit", "true");
      await expect(page.getByTestId("stat-xp")).toHaveAttribute("data-xp", "115");
    });
  });

  test("plain mode hides the numbers; the lesson works the same and its XP still counts", async ({ page }) => {
    test.setTimeout(240_000);
    await openSettings(page);
    await page.getByRole("switch", { name: "Plain mode" }).check();
    await expect(page.getByTestId("settings-status")).toHaveText("Saved.");

    await openPath(page);
    await expect(page.getByTestId("stats")).toHaveCount(0);
    await expect(page.getByTestId("settings-link")).toBeVisible();

    await finishVarsReassign(page);
    const done = page.getByTestId("lesson-complete");
    await expect(done).toHaveAttribute("data-plain", "true");
    await expect(done).not.toContainText("first try");
    await expect(page.getByTestId("rewards")).toHaveCount(0);
    await expect(page.getByTestId("goal-question")).toHaveCount(0);

    await openSettings(page);
    await expect(page.getByRole("switch", { name: "Plain mode" })).toBeChecked();
    await page.getByRole("switch", { name: "Plain mode" }).uncheck();
    await expect(page.getByTestId("settings-status")).toHaveText("Saved.");
    await openPath(page);
    await expect(page.getByTestId("stat-xp")).toHaveAttribute("data-xp", "60");
  });
});

test.describe("settings", () => {
  test("download my data: one JSON file with every event, envelopes intact, nothing sent", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => { if (r.method() !== "GET") requests.push(`${r.method()} ${r.url()}`); });

    await openSettings(page);
    await page.locator('[data-goal="10"]').click();
    await expect(page.getByTestId("settings-status")).toHaveText("Saved.");
    await openLesson(page, VARS_USE);
    await page.getByTestId("continue").click();
    await choice(page, "Ada Lovelace").click();
    await page.getByTestId("check").click();
    await expect(page.getByTestId("feedback")).toHaveAttribute("data-tone", "correct");

    await openSettings(page);
    await expect(page.getByRole("radio", { name: /Casual/ })).toBeChecked();
    const [file] = await Promise.all([page.waitForEvent("download"), page.getByTestId("download-data").click()]);
    expect(file.suggestedFilename()).toMatch(/^educrs-progress-\d{4}-\d{2}-\d{2}\.json$/);
    const doc = JSON.parse(fs.readFileSync(await file.path(), "utf8"));
    expect(doc).toMatchObject({ format: "educrs-progress", version: 1 });
    expect(doc.events.length).toBeGreaterThanOrEqual(3);
    for (const e of doc.events) expect(Object.keys(e).sort()).toEqual(["dev", "id", "p", "rs", "t", "type", "tz", "v"]);
    expect(doc.events.map((e: { type: string }) => e.type)).toEqual(expect.arrayContaining(["settings.changed", "lesson.started", "exercise.attempt"]));
    expect(doc.events.find((e: { type: string }) => e.type === "exercise.attempt").p).toMatchObject({
      exerciseId: "ex:vars.use/predict-two-vars", correct: true, hints: 0, revealRatio: 0, difficulty: "easy",
    });
    expect(requests).toEqual([]); // the store is local; downloading is not a request either
  });

  test("no CSP violations on the settings page", async ({ page }) => {
    const cspErrors: string[] = [];
    page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) cspErrors.push(m.text()); });
    await openSettings(page);
    await page.getByRole("switch", { name: "Plain mode" }).check();
    await expect(page.getByTestId("settings-status")).toHaveText("Saved.");
    await openPath(page);
    expect(cspErrors).toEqual([]);
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`no serious accessibility violations on the settings page (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await openSettings(page);
      await page.locator('[data-goal="30"]').click();
      await expect(page.getByTestId("settings-status")).toHaveText("Saved.");
      expect(await seriousViolations(page)).toEqual([]);
    });
  }

  test("the path's stats bar has no serious accessibility violations once there is progress", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openLesson(page, VARS_USE);
    await page.getByTestId("continue").click();
    await choice(page, "Ada Lovelace").click();
    await page.getByTestId("check").click();
    await expect(page.getByTestId("feedback")).toHaveAttribute("data-tone", "correct");
    await openPath(page);
    await expect(page.getByTestId("stat-xp")).toHaveAttribute("data-xp", "10");
    expect(await seriousViolations(page)).toEqual([]);
    expect(page.url()).toContain(PATH);
  });
});
