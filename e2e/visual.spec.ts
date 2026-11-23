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

// ------------------------------------------------------------------ details (§17.7–17.8)

test("the head carries theme-color for both schemes and preloads the Lexend file the page then uses", async ({ page }) => {
  const fonts: string[] = [];
  page.on("request", (r) => { if (r.url().endsWith(".woff2")) fonts.push(r.url()); });
  await page.goto("/learn/");
  await page.evaluate(() => document.fonts.ready);
  const colors = await page.locator('meta[name="theme-color"]').evaluateAll((els) => els.map((e) => `${e.getAttribute("media")} ${e.getAttribute("content")}`));
  expect(colors).toEqual(["(prefers-color-scheme: light) #fff8f1", "(prefers-color-scheme: dark) #16132b"]);
  const preload = new URL((await page.getByTestId("font-preload").getAttribute("href"))!, page.url()).href;
  expect(preload).toMatch(/lexend-latin-wght-normal/);
  expect(fonts.filter((u) => u === preload)).toHaveLength(1); // preloaded once, then used — not fetched twice
});

// Nothing may scroll sideways on a 375 px phone: a wide row (the symbol bar) once pushed the lesson
// card past the screen while every test stayed green (§17.9).
for (const [name, url, enter] of [
  ["home", "/", false],
  ["path", "/learn/", false],
  ["settings", "/settings/", false],
  ["a code step", "/learn/m0/intro-run-code/", true],
  ["the 404 page", "/no-such-page/", false],
] as const) {
  test(`no sideways scrolling at 375 px: ${name}`, async ({ page, isMobile }) => {
    // The iPhone project is already phone-sized (and is where the symbol bar shows: touch only);
    // resizing a mobile WebKit page mid-test breaks its hit-testing.
    if (!isMobile) await page.setViewportSize({ width: 375, height: 740 });
    await page.goto(url);
    if (enter) {
      await expect(page.getByTestId("lesson")).toHaveAttribute("data-ready", "true");
      await page.getByTestId("continue").click();
      await expect(page.getByTestId("code-editor")).toHaveAttribute("data-ready", "true");
    }
    await page.evaluate(() => document.fonts.ready);
    const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(scroll).toBeLessThanOrEqual(client);
  });
}

test("on a short card the bottom zone sits at the bottom of the screen; after a check the pick takes the tone", async ({ page, isMobile }) => {
  if (!isMobile) await page.setViewportSize({ width: 390, height: 844 });
  await openLesson(page, VARS_USE);
  const bar = page.getByTestId("action-bar");
  const box = (await bar.boundingBox())!;
  const height = page.viewportSize()!.height;
  expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(height - 2);
  await page.getByTestId("continue").click();
  await expect(page.getByTestId("eyebrow")).toHaveText("Predict the output");
  await choice(page, "first last").click();
  await page.getByTestId("check").click();
  await expect(page.getByTestId("feedback")).toHaveAttribute("data-tone", "mixup");
  const picked = choice(page, "first last");
  await expect(picked).toHaveAttribute("data-result", "mixup");
  await expect(picked).toContainText("!");
  await expect(choice(page, "Ada Lovelace")).not.toHaveAttribute("data-result", /./);
});

test("the 404 page answers 404 and leads back to the path", async ({ page }) => {
  const res = await page.goto("/no-such-page/");
  expect(res?.status()).toBe(404);
  await expect(page.getByTestId("not-found")).toBeVisible();
  await page.getByRole("link", { name: "Back to the learning path" }).click();
  await expect(page).toHaveURL("/learn/");
});

test("Windows forced-colours mode: buttons keep a visible outline", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "forced-colors emulation is Chromium-only in Playwright");
  await page.emulateMedia({ forcedColors: "active" });
  await openLesson(page, VARS_USE);
  const border = await page.getByTestId("continue").evaluate((el) => {
    const cs = getComputedStyle(el);
    return { style: cs.borderTopStyle, width: cs.borderTopWidth, color: cs.borderTopColor };
  });
  expect(border.style).toBe("solid");
  expect(border.width).not.toBe("0px");
  expect(border.color).not.toBe("rgba(0, 0, 0, 0)");
});
