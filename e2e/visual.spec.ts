import { expect, test } from "@playwright/test";
import { VARS_USE, choice, openLesson, openPath } from "./flows.ts";

// Visual direction A (docs/05-f3-mvp0.md §17.6). A green unit-test run doesn't prove the page looks
// right — CSS can be blocked or a font can fail silently — so these read what the browser computed.

const PRESS_EDGE = { light: "rgb(49, 46, 129)", dark: "rgb(99, 102, 241)" }; // --color-accent-shadow

for (const scheme of ["light", "dark"] as const) {
  test(`fonts and the pressable button are really applied (${scheme})`, async ({ page }) => {
    const fonts: { url: string; bytes: number }[] = [];
    page.on("response", async (r) => {
      if (r.url().endsWith(".woff2")) fonts.push({ url: r.url(), bytes: (await r.body().catch(() => Buffer.alloc(0))).length });
    });
    await page.emulateMedia({ colorScheme: scheme });
    await openLesson(page, VARS_USE);
    await page.evaluate(() => document.fonts.ready);

    const h1 = await page.locator("h1").evaluate((el) => getComputedStyle(el).fontFamily);
    expect(h1).toContain("Lexend Variable");
    expect(await page.evaluate(() => document.fonts.check('700 28px "Lexend Variable"'))).toBe(true);
    expect(await page.evaluate(() => document.fonts.check('16px "JetBrains Mono Variable"'))).toBe(true);
    const code = await page.locator("pre").first().evaluate((el) => getComputedStyle(el).fontFamily);
    expect(code).toContain("JetBrains Mono Variable");

    const shadow = await page.getByTestId("continue").evaluate((el) => getComputedStyle(el).boxShadow);
    expect(shadow).toContain(PRESS_EDGE[scheme]);
    expect(shadow).toContain("4px");

    // Only the Latin files are fetched, and together they stay within the font budget (§17.6).
    await expect.poll(() => fonts.length).toBeGreaterThanOrEqual(2);
    for (const f of fonts) expect(f.url).toMatch(/-latin-wght-normal\.[^/]*woff2$|-latin-wght-normal-[^/]*\.woff2$/);
    expect(fonts.reduce((n, f) => n + f.bytes, 0)).toBeLessThanOrEqual(90 * 1024);
  });
}

test("a lesson left half-way says 'In progress' on the path, even when it isn't the next one", async ({ page }) => {
  await openLesson(page, VARS_USE);
  await page.getByTestId("continue").click();
  await choice(page, "Ada Lovelace").click();
  await page.getByTestId("check").click();
  await expect(page.getByTestId("feedback")).toHaveAttribute("data-tone", "correct");
  await openPath(page);
  const node = page.locator(`[data-testid="path-node"][href="${VARS_USE}"]`);
  await expect(node).toHaveAttribute("data-state", "todo");
  await expect(node).toHaveAttribute("data-in-progress", "true");
  await expect(node).toContainText("In progress");
});
