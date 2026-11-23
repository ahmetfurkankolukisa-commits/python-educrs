import { expect, test, type Page } from "@playwright/test";
import { editorReady, editorText, modKey, setCode } from "./helpers.ts";
import { VARS_USE, choice, openLesson, openPath, openSettings, seriousViolations, settled } from "./flows.ts";

// The craft pass (docs/05-f3-mvp0.md §17.11): Byte the mascot, the trail on the path, the small
// reward moments, wide screens. Like visual.spec.ts these read what the browser computed and where
// it drew things — markup that is present but unstyled or misplaced would pass anything less.

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** What a colour token resolves to on this page, as the browser reports colours. */
const token = (page: Page, name: string) => page.evaluate((n) => {
  const probe = document.createElement("span");
  probe.style.color = `var(${n})`;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}, name);

const animation = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).animationName);

// ------------------------------------------------------------------ Byte

test("Byte stands on the feedback sheet with the mood of the answer, clear of its words", async ({ page }) => {
  await openLesson(page, VARS_USE);
  await page.getByTestId("continue").click();
  const feedback = page.getByTestId("feedback");
  const byte = feedback.getByTestId("mascot");
  const options = await page.locator("[data-choice]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.choice!));
  const plainWrong = options.find((o) => o !== "Ada Lovelace" && o !== "first last")!;

  for (const [pick, tone, mood] of [["first last", "mixup", "thinking"], [plainWrong, "wrong", "oops"], ["Ada Lovelace", "correct", "happy"]] as const) {
    await choice(page, pick).click();
    await page.getByTestId("check").click();
    await expect(feedback).toHaveAttribute("data-tone", tone);
    await expect(byte).toHaveAttribute("data-mood", mood);

    // Drawn at its size and in the theme's colour — not merely present in the markup.
    await settled(page);
    const box = (await byte.boundingBox())!;
    expect([Math.round(box.width), Math.round(box.height)]).toEqual([72, 72]);
    expect(await byte.locator(".shell").first().evaluate((el) => getComputedStyle(el).fill)).toBe(await token(page, "--color-accent"));
    // Decoration: assistive technology never meets it, and it covers neither the title, the
    // message nor a button.
    await expect(byte).toHaveAttribute("aria-hidden", "true");
    for (const part of [feedback.locator("h2"), feedback.locator(".inner > .body"), page.getByTestId("feedback-primary")]) {
      expect(overlap(box, (await part.boundingBox())!), `Byte covers ${await part.evaluate((el) => el.className || el.tagName)}`).toBe(false);
    }
    if (tone !== "correct") await page.getByTestId("feedback-primary").click();
  }
});

test("plain mode: no Byte on the feedback sheet", async ({ page }) => {
  await openSettings(page);
  await page.getByRole("switch", { name: "Plain mode" }).check();
  await expect(page.getByTestId("settings-status")).toHaveText("Saved.");
  await openLesson(page, VARS_USE);
  await page.getByTestId("continue").click();
  await choice(page, "Ada Lovelace").click();
  await page.getByTestId("check").click();
  await expect(page.getByTestId("feedback")).toHaveAttribute("data-tone", "correct");
  await expect(page.getByTestId("mascot")).toHaveCount(0);
});

test("Byte blinks and waves, the bar glints, the right pick pops — and none of it under reduced motion", async ({ page }) => {
  await openPath(page);
  await expect(page.getByTestId("mascot")).toHaveAttribute("data-mood", "hello");
  expect(await animation(page, '[data-testid="mascot"] .eyes')).not.toBe("none");
  expect(await animation(page, '[data-testid="mascot"] .wave')).not.toBe("none");

  const toFeedback = async () => {
    await openLesson(page, VARS_USE);
    await page.getByTestId("continue").click();
    await choice(page, "Ada Lovelace").click();
    await page.getByTestId("check").click();
    await expect(page.getByTestId("feedback")).toHaveAttribute("data-tone", "correct");
  };
  const duration = (selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).animationDuration);
  await toFeedback();
  expect(await animation(page, '[data-testid="lesson-progress"] .glint')).not.toBe("none");
  expect(await animation(page, '[data-choice="Ada Lovelace"]')).not.toBe("none");
  expect(await duration('[data-choice="Ada Lovelace"]')).not.toBe("0s");

  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await animation(page, '[data-testid="lesson-progress"] .glint')).toBe("none");
  expect(await duration('[data-choice="Ada Lovelace"]')).toBe("0s"); // the pop takes no time at all
  await openPath(page);
  expect(await animation(page, '[data-testid="mascot"] .eyes')).toBe("none");
  expect(await animation(page, '[data-testid="mascot"] .wave')).toBe("none");
});

// ------------------------------------------------------------------ the path's trail

test("the path draws a trail from each lesson to the next: dotted ahead, leaning the way the path turns", async ({ page }) => {
  await openPath(page);
  const border = await token(page, "--color-border");
  const lists = await page.locator('[data-testid="learning-path"] ol').evaluateAll((ols) => ols.map((ol) => [...ol.children].map((li) => {
    const after = getComputedStyle(li, "::after");
    const r = li.getBoundingClientRect();
    return { x: r.left + r.width / 2, content: after.content, style: after.borderLeftStyle, width: after.borderLeftWidth, color: after.borderLeftColor, rotate: after.rotate };
  })));
  expect(lists.length).toBeGreaterThan(1);
  let trails = 0;
  for (const rows of lists) {
    rows.forEach((row, i) => {
      if (i === rows.length - 1) {
        expect(row.content, "nothing hangs under a module's last lesson").toBe("none");
        return;
      }
      trails += 1;
      expect([row.style, row.width, row.color]).toEqual(["dotted", "4px", border]);
      // The line hangs from its top; a negative angle swings its end to the right. It has to
      // swing towards the next lesson, whichever way the zig-zag goes there.
      const lean = Number.parseFloat(row.rotate);
      expect(Math.abs(lean)).toBeGreaterThan(30);
      expect(Math.sign(rows[i + 1].x - row.x), `row ${i + 1}: next lesson is at ${rows[i + 1].x - row.x}px, the trail leans ${row.rotate}`).toBe(-Math.sign(lean));
    });
  }
  expect(trails).toBeGreaterThan(10);
});

// ------------------------------------------------------------------ wide screens and the home page

test("on a wide screen the buttons follow the card instead of sitting at the bottom of the window", async ({ page, isMobile }) => {
  test.skip(isMobile, "the iPhone project is phone-sized; visual.spec.ts covers the bottom zone there");
  await page.setViewportSize({ width: 1280, height: 1400 });
  await openLesson(page, VARS_USE);
  const card = (await page.getByTestId("lesson-step").boundingBox())!;
  const bar = (await page.getByTestId("action-bar").boundingBox())!;
  const gap = bar.y - (card.y + card.height);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThanOrEqual(32);
  expect(bar.y + bar.height).toBeLessThan(1400 - 100); // …and so, on this short card, well above the bottom edge

  // The feedback sheet too: under the card it belongs to, not across the bottom of a tall window.
  await page.getByTestId("continue").click();
  await choice(page, "Ada Lovelace").click();
  await page.getByTestId("check").click();
  await expect(page.getByTestId("feedback")).toHaveAttribute("data-tone", "correct");
  await settled(page);
  const sheet = (await page.getByTestId("feedback").boundingBox())!;
  const answered = (await page.getByTestId("lesson-step").boundingBox())!;
  expect(sheet.y - (answered.y + answered.height)).toBeLessThanOrEqual(48);
  expect(sheet.y + sheet.height).toBeLessThan(1400 - 100);
});

test("home: Byte greets everyone; the lesson preview is for wide screens and is pure decoration", async ({ page, isMobile }) => {
  await page.goto("/");
  const art = page.locator(".hero .art");
  await expect(art).toHaveAttribute("aria-hidden", "true");
  const byte = art.getByTestId("mascot");
  const clear = async () => {
    await expect(byte).toBeVisible();
    const box = (await byte.boundingBox())!;
    for (const part of [page.locator(".hero h1"), page.locator(".hero h1 + p"), page.getByTestId("start-learning")]) {
      expect(overlap(box, (await part.boundingBox())!)).toBe(false);
    }
  };
  if (!isMobile) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(art.locator(".preview")).toBeVisible();
    await clear();
    await page.setViewportSize({ width: 375, height: 740 });
  }
  await expect(art.locator(".preview")).toBeHidden();
  await clear();
});

// ------------------------------------------------------------------ states nobody had looked at (§17.14)

test("headings keep their weight in the app (its reset makes headings inherit; Storybook's did not)", async ({ page }) => {
  const weight = (selector: string) => page.locator(selector).first().evaluate((el) => getComputedStyle(el).fontWeight);
  await openPath(page);
  expect(await weight('[data-testid="learning-path"] h2')).toBe("700");
  await openSettings(page);
  expect(await weight("#goal-title")).toBe("700");
  await openLesson(page, VARS_USE);
  await page.getByTestId("continue").click();
  await choice(page, "Ada Lovelace").click();
  await page.getByTestId("check").click();
  await expect(page.getByTestId("feedback")).toHaveAttribute("data-tone", "correct");
  expect(await weight('[data-testid="feedback"] h2')).toBe("700");
});

test("Python cannot start: a plain red dot, what to do next, and nothing to press in vain", async ({ page }) => {
  await page.route("http://127.0.0.1:4322/**", (route) => route.abort());
  await openLesson(page, "/learn/m0/intro-run-code/");
  await page.getByTestId("continue").click();
  const status = page.getByTestId("runner-status");
  await expect(status).toHaveAttribute("data-status", "failed", { timeout: 60_000 });
  await expect(status).toContainText("Python could not start in this browser");
  await expect(page.getByTestId("runner-failed")).toContainText("Try reloading the page");
  // The dot is a dot. It once took the help card's padding through a shared class name and
  // became a red blob three times its size.
  const dot = status.locator(".dot");
  const box = (await dot.boundingBox())!;
  expect([Math.round(box.width), Math.round(box.height)]).toEqual([10, 10]);
  expect(await dot.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(await token(page, "--color-danger"));
  await expect(page.getByRole("button", { name: "Run", exact: true })).toBeDisabled();
  await expect(page.getByTestId("check")).toBeDisabled();
});

test("code steps: 'Show me' adds the solution one line at a time, under a label that says what it is", async ({ page }) => {
  test.setTimeout(240_000);
  await openLesson(page, VARS_USE);
  await page.getByTestId("continue").click();
  for (const pick of ["Ada Lovelace", "name"]) {
    await choice(page, pick).click();
    await page.getByTestId("check").click();
    await expect(page.getByTestId("feedback")).toHaveAttribute("data-tone", "correct");
    await page.getByTestId("feedback-primary").click();
  }
  await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-kind", "verbatim");
  await expect(page.getByTestId("runner-status")).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
  const feedback = page.getByTestId("feedback");
  const revealed = page.getByTestId("revealed-code");
  for (const attempt of [1, 2]) {
    await setCode(page, `print("try ${attempt}")`);
    await page.getByTestId("check").click();
    await expect(feedback).toHaveAttribute("data-tone", /^(mixup|wrong)$/, { timeout: 70_000 });
    if (attempt === 1) {
      await expect(feedback.getByRole("button", { name: "Show me" })).toHaveCount(0); // not after one try
      await page.getByTestId("feedback-primary").click();
    }
  }
  await feedback.getByRole("button", { name: "Show me" }).click();
  await expect(revealed.getByTestId("code-block")).toHaveText('city = "Lisbon"');
  await expect(revealed.getByText("Solution so far")).toBeVisible();
  // a label people can see: not the 1 px box that only screen readers find
  expect((await revealed.getByText("Solution so far").boundingBox())!.height).toBeGreaterThan(12);
  // …and the learner sees it happen: on screen, clear of the bottom bar, right above the editor,
  // with focus on it. (It used to appear below the fold while the page jumped to the top.)
  const seen = async () => {
    await expect(revealed).toBeInViewport({ ratio: 1 });
    await expect(revealed).toBeFocused();
    const box = (await revealed.boundingBox())!;
    expect(overlap(box, (await page.getByTestId("action-bar").boundingBox())!)).toBe(false);
    const editor = (await page.getByTestId("code-editor").boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(editor.y);
  };
  await seen();

  await page.getByTestId("show-me").click();
  await expect(revealed.getByTestId("code-block")).toHaveText('city = "Lisbon"\nprint("I live in", city)');
  await expect(revealed).toBeInViewport({ ratio: 1 });
  await expect(revealed).toBeFocused();
  await expect(page.getByTestId("show-me")).toHaveCount(0); // nothing left to show
});

// ------------------------------------------------------------------ the editor (§17.15)

/** WCAG contrast ratio of two colours as the browser reports them ("rgb(r, g, b)"). */
function contrast(a: string, b: string) {
  const luminance = (c: string) => {
    const [r, g, bl] = c.match(/[\d.]+/g)!.slice(0, 3).map((v) => {
      const s = Number(v) / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

async function openEmptyEditor(page: Page) {
  await openLesson(page, "/learn/m0/intro-run-code/");
  await page.getByTestId("continue").click();
  await editorReady(page);
  await page.locator(".cm-editor").scrollIntoViewIfNeeded();
}

for (const scheme of ["light", "dark"] as const) {
  // The owner's report from the live site: "the cursor doesn't show" — dark theme, a black cursor
  // on a near-black editor. CodeMirror picks its light or dark defaults by a flag on its theme,
  // not by the page's colours.
  test(`the editor's cursor can be seen, and so can the line it is on (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openEmptyEditor(page);
    await page.locator(".cm-content").click();
    await expect(page.locator(".cm-editor")).toHaveClass(/cm-focused/);

    const cursor = page.locator(".cm-cursor").first();
    const drawn = await cursor.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { color: cs.borderLeftColor, edge: `${cs.borderLeftWidth} ${cs.borderLeftStyle}`, display: cs.display };
    });
    const background = await page.locator(".cm-editor").evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(drawn.display).not.toBe("none");
    expect(drawn.edge).toBe("2px solid");
    expect(drawn.color).toBe(await token(page, "--color-text"));
    expect(contrast(drawn.color, background), `cursor ${drawn.color} on ${background}`).toBeGreaterThanOrEqual(7);
    expect((await cursor.boundingBox())!.height).toBeGreaterThanOrEqual(16); // a full line tall, on screen

    // the line with the cursor is tinted, and its number stands out from the others
    await expect(page.locator(".cm-activeLine")).toHaveCount(1);
    expect(await page.locator(".cm-activeLine").evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
    expect(await page.locator(".cm-activeLineGutter").evaluate((el) => getComputedStyle(el).color)).toBe(drawn.color);
    // no ligatures in code: != must stay two characters a beginner can find on the keyboard
    expect(await page.locator(".cm-content").evaluate((el) => getComputedStyle(el).fontVariantLigatures)).toBe("no-contextual");
  });
}

test("an empty editor says where to type, and a click anywhere inside it starts the typing", async ({ page, isMobile }) => {
  await openEmptyEditor(page);
  const editor = page.locator(".cm-editor");
  await expect(page.locator(".cm-placeholder")).toHaveText("Type your code here");
  const box = (await editor.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(140);
  // far from the one (empty) line: the bottom of the box
  const [x, y] = [box.x + box.width / 2, box.y + box.height - 14];
  if (isMobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
  await expect(editor).toHaveClass(/cm-focused/);
  await page.keyboard.type("print(1)");
  await expect(page.locator(".cm-content")).toHaveText("print(1)");
  await expect(page.locator(".cm-placeholder")).toHaveCount(0);
});

test("the editor takes the textarea's place without moving the page", async ({ page }) => {
  // Hold the editor's script back so the textarea can be measured first.
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(/codemirror-setup[^/]*\.js$/, async (route) => { await held; await route.continue(); });
  await openLesson(page, "/learn/m0/intro-run-code/");
  await page.getByTestId("continue").click();
  const editor = page.getByTestId("code-editor");
  await expect(editor.locator("textarea")).toBeVisible();
  await expect(editor.locator("textarea")).toHaveAttribute("placeholder", "Type your code here");
  const before = (await editor.boundingBox())!.height;
  release();
  await editorReady(page);
  const after = (await editor.boundingBox())!.height;
  expect(Math.abs(after - before), `textarea ${before}px, editor ${after}px`).toBeLessThanOrEqual(1);
});

// ------------------------------------------------------------------ full-screen mode (§17.15)

const RUN_CODE = "/learn/m0/intro-run-code/";
async function openCodeStep(page: Page) {
  await openLesson(page, RUN_CODE);
  await page.getByTestId("continue").click();
  await editorReady(page);
  await expect(page.getByTestId("runner-status")).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
}
const filled = async (page: Page) => {
  const view = page.viewportSize()!;
  const box = (await page.getByTestId("workspace").boundingBox())!;
  return [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)].join(" ") === `0 0 ${view.width} ${view.height}`;
};

test("full screen: the code area takes the window, the page behind is out of reach, and nothing typed is lost", async ({ page, isMobile }) => {
  test.setTimeout(180_000);
  if (!isMobile) await page.setViewportSize({ width: 1280, height: 800 });
  await openCodeStep(page);
  await setCode(page, 'print("before")');
  const workspace = page.getByTestId("workspace");

  await page.getByTestId("full-screen").click();
  await expect(workspace).toHaveAttribute("data-expanded", "true");
  await expect(workspace).toHaveRole("dialog");
  await expect(workspace).toHaveAccessibleName("Your code");
  await expect.poll(() => filled(page)).toBe(true);
  await expect(page.locator(".cm-editor")).toHaveClass(/cm-focused/); // ready to type
  // The page behind is inert (no focus, no clicks, not read out) and does not scroll.
  expect(await page.getByTestId("lesson-exit").evaluate((el) => el.closest("[inert]") !== null)).toBe(true);
  expect(await workspace.evaluate((el) => el.closest("[inert]") !== null)).toBe(false);
  expect(await page.evaluate(() => document.documentElement.style.overflow)).toBe("hidden");

  // A long program scrolls INSIDE the editor; the buttons and the output stay on screen.
  const long = Array.from({ length: 60 }, (_, i) => `print(${i})`).join("\n");
  await setCode(page, long);
  const scroller = await page.locator(".cm-scroller").evaluate((el) => ({ content: el.scrollHeight, shown: el.clientHeight }));
  expect(scroller.content).toBeGreaterThan(scroller.shown);
  expect(await filled(page)).toBe(true);
  const run = page.getByRole("button", { name: "Run", exact: true });
  await expect(run).toBeInViewport({ ratio: 1 });
  await run.click();
  const output = page.getByTestId("runner-output");
  await expect(output).toContainText("59");
  await expect(output).toBeInViewport();
  // Beside the editor on a wide screen, under it on a phone.
  const [editor, out] = [(await page.locator(".cm-editor").boundingBox())!, (await output.boundingBox())!];
  if (isMobile) expect(out.y).toBeGreaterThanOrEqual(editor.y + editor.height);
  else expect(out.x).toBeGreaterThanOrEqual(editor.x + editor.width);
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll).toBeLessThanOrEqual(client);

  // Esc closes it. The same editor: the code is there and undo still knows the earlier program.
  await page.locator(".cm-content").click();
  await page.keyboard.press("Escape");
  await expect(workspace).toHaveAttribute("data-expanded", "false");
  await expect(workspace).not.toHaveRole("dialog");
  await expect(page.getByTestId("full-screen")).toBeFocused();
  expect(await page.evaluate(() => [document.querySelectorAll("[inert]").length, document.documentElement.style.overflow])).toEqual([0, ""]);
  expect(await editorText(page)).toBe(long);
  await page.locator(".cm-content").click();
  await page.keyboard.press(`${await modKey(page)}+Z`);
  expect(await editorText(page)).toBe('print("before")');

  // …and the button in the bar closes it too.
  await page.getByTestId("full-screen").click();
  await expect(workspace).toHaveAttribute("data-expanded", "true");
  await page.getByTestId("exit-full-screen").click();
  await expect(workspace).toHaveAttribute("data-expanded", "false");
});

test("full screen: Check goes back to the lesson, where the result is shown", async ({ page }) => {
  await openCodeStep(page);
  await page.getByTestId("full-screen").click();
  await expect(page.getByTestId("workspace")).toHaveAttribute("data-expanded", "true");
  await setCode(page, 'print("I am learning Python!")');
  await page.getByTestId("check").click();
  await expect(page.getByTestId("workspace")).toHaveAttribute("data-expanded", "false");
  const feedback = page.getByTestId("feedback");
  await expect(feedback).toHaveAttribute("data-tone", "correct", { timeout: 70_000 });
  await expect(feedback).toBeInViewport();
  expect(await page.evaluate(() => document.querySelectorAll("[inert]").length)).toBe(0);
  await page.getByTestId("feedback-primary").click(); // the lesson goes on
  await expect(page.getByTestId("lesson-step")).toHaveAttribute("data-step", "2");
});

for (const scheme of ["light", "dark"] as const) {
  test(`full screen has no serious accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await openCodeStep(page);
    await page.getByTestId("full-screen").click();
    await expect(page.getByTestId("workspace")).toHaveAttribute("data-expanded", "true");
    await setCode(page, 'print("Hi")');
    expect(await seriousViolations(page)).toEqual([]);
  });
}
