import { expect, test, type Page } from "@playwright/test";
import { SETTINGS, VARS_USE, choice, openLesson, openPath, openSettings, seriousViolations } from "./flows.ts";

// The learner's own colour theme (docs/05-f3-mvp0.md §17.18): chosen in Settings, stored as an
// event, mirrored for the first paint. These read what the browser drew, not what was stored.

const LIGHT = "rgb(255, 248, 241)";
const DARK = "rgb(22, 19, 43)";
const BLACK = "rgb(0, 0, 0)";
const KEY = "educrs:theme";

const look = (page: Page) => page.evaluate((key) => ({
  theme: document.documentElement.getAttribute("data-theme"),
  background: getComputedStyle(document.body).backgroundColor,
  bar: [...document.querySelectorAll('meta[name="theme-color"]')].map((m) => m.getAttribute("content")),
  mirror: localStorage.getItem(key),
}), KEY);

async function pick(page: Page, theme: string) {
  await page.locator(`[data-testid="theme-picker"] [data-choice="${theme}"]`).click();
  await expect(page.getByTestId("settings-status")).toHaveText("Saved.");
}

test("high contrast: chosen once, it is on every page — and there before any script has run", async ({ page }) => {
  const csp: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text()); });
  await openSettings(page);
  await expect(page.getByRole("radio", { name: "Same as my device" })).toBeChecked();
  expect((await look(page)).theme).toBeNull();

  await pick(page, "high-contrast");
  const chosen = { theme: "high-contrast", background: BLACK, bar: ["#000000", "#000000"], mirror: "high-contrast" };
  expect(await look(page)).toEqual(chosen); // at once, on the page where it was picked

  await page.goto("/"); // the home page never reads the learner's events: the mirror alone carries it
  expect(await look(page)).toEqual(chosen);
  await openPath(page);
  expect(await look(page)).toEqual(chosen);
  await openLesson(page, VARS_USE);
  expect(await look(page)).toEqual(chosen);

  // No scripts at all: only the few inline lines in <head> can have done this. That is what
  // "before the first paint" means — no flash of the wrong theme while the page loads.
  await page.route("**/*.js", (route) => route.abort());
  await page.goto(SETTINGS);
  expect(await look(page)).toEqual(chosen);
  await page.unroute("**/*.js");

  await openSettings(page);
  await expect(page.getByRole("radio", { name: "High contrast" })).toBeChecked();
  expect(csp).toEqual([]); // the inline script is pinned by its hash, not let in by 'unsafe-inline'
});

test("a theme can be forced against the device, and 'same as my device' gives the choice back", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await openSettings(page);
  const device = { theme: null, background: DARK, bar: ["#fff8f1", "#16132b"], mirror: null };
  expect(await look(page)).toEqual(device);

  await pick(page, "light");
  expect(await look(page)).toEqual({ theme: "light", background: LIGHT, bar: ["#fff8f1", "#fff8f1"], mirror: "light" });
  await pick(page, "system");
  expect(await look(page)).toEqual(device);

  await page.emulateMedia({ colorScheme: "light" });
  expect((await look(page)).background).toBe(LIGHT); // …and follows the device again
  await pick(page, "dark");
  expect(await look(page)).toEqual({ theme: "dark", background: DARK, bar: ["#16132b", "#16132b"], mirror: "dark" });
  await page.reload();
  await page.waitForSelector('[data-testid="settings"][data-ready="true"]');
  await expect(page.getByRole("radio", { name: "Dark" })).toBeChecked();
});

test("the mirror is only a mirror: lost, it comes back from the events; wrong, it is put right", async ({ page }) => {
  await openSettings(page);
  await pick(page, "dark");

  await page.evaluate(() => localStorage.clear());
  await openPath(page); // a page that reads the events
  await expect.poll(async () => (await look(page)).theme).toBe("dark");
  expect((await look(page)).mirror).toBe("dark");

  await page.evaluate((key) => localStorage.setItem(key, "high-contrast"), KEY);
  await openPath(page);
  await expect.poll(async () => (await look(page)).theme).toBe("dark");
  expect(await look(page)).toMatchObject({ background: DARK, mirror: "dark" });
});

test("high contrast has no serious accessibility violations on the app's own pages", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openSettings(page);
  await pick(page, "high-contrast");
  expect(await seriousViolations(page), "settings").toEqual([]);
  await page.goto("/");
  expect(await seriousViolations(page), "home").toEqual([]);
  await openPath(page);
  expect(await seriousViolations(page), "path").toEqual([]);
  await openLesson(page, VARS_USE);
  expect(await seriousViolations(page), "lesson: explanation").toEqual([]);
  await page.getByTestId("continue").click();
  await choice(page, "first last").click();
  await page.getByTestId("check").click();
  await expect(page.getByTestId("feedback")).toHaveAttribute("data-tone", "mixup");
  expect(await seriousViolations(page), "lesson: feedback").toEqual([]);
  await page.goto("/no-such-page/");
  expect(await seriousViolations(page), "404").toEqual([]);
});
