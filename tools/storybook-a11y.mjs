#!/usr/bin/env node
// Accessibility gate for the design system (plan §2.4, docs/05-f3-mvp0.md §5).
// Every Storybook story is scanned with axe in all three themes; serious/critical violations
// fail the run. Build first:  pnpm --filter @educrs/ui build-storybook
//
// The gate proves it can fail on every run (CLAUDE.md: "prove checks fire"): after the real
// scan it plants known violations — one in the light DOM and one inside the editor's shadow
// root, where CodeMirror lives — and fails unless axe reports both.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "@playwright/test";
import { serve } from "./serve-dist.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "packages", "ui", "storybook-static");
const THEMES = ["light", "dark", "high-contrast"];
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const HOST = "127.0.0.1";
const PORT = 4330;

if (!fs.existsSync(path.join(dir, "index.json"))) {
  console.error("packages/ui/storybook-static missing — run `pnpm --filter @educrs/ui build-storybook` first");
  process.exit(1);
}
const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));
const stories = Object.values(index.entries).filter((e) => e.type === "story");
if (stories.length === 0) {
  console.error("no stories found in storybook-static/index.json");
  process.exit(1);
}

const server = await serve(dir, HOST, PORT);
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

/** Open a story in a theme and wait until it has rendered (and CodeMirror, if any, is mounted). */
async function open(id, theme) {
  pageErrors.length = 0;
  await page.goto(`http://${HOST}:${PORT}/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`);
  await page.waitForSelector("#storybook-root > *", { timeout: 30_000 });
  await page.waitForFunction(
    () => [...document.querySelectorAll('[data-testid="code-editor"]')].every(
      // enhanced editors must finish loading; the textarea fallback (no loading hint) never does
      (el) => el.getAttribute("data-ready") === "true" || !el.querySelector('[id$="-loading"]'),
    ),
    undefined,
    { timeout: 30_000 },
  );
  // Scan the settled state: mid-animation (e.g. a panel fading in) text is translucent and
  // would fail contrast for a reason no learner ever sees for more than 200 ms.
  // Only animations that END: Byte's blink and the editor's cursor repeat forever, and waiting for
  // those never returns (it hung the scan the day the mascot arrived, docs/05-f3-mvp0.md §17.14).
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
    .map((a) => a.finished.catch(() => {}))));
  const state = await page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    error: document.body.classList.contains("sb-show-errordisplay"),
  }));
  if (state.error) throw new Error("story failed to render (Storybook error display)");
  if (state.theme !== theme) throw new Error(`theme not applied: expected ${theme}, got ${state.theme}`);
  if (pageErrors.length) throw new Error(`page errors: ${pageErrors.join("; ")}`);
}

const scan = async () =>
  (await new AxeBuilder({ page }).include("#storybook-root").withTags(TAGS).analyze()).violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );

let failed = false;
for (const story of stories) {
  for (const theme of THEMES) {
    const label = `${story.title} / ${story.name} [${theme}]`;
    try {
      await open(story.id, theme);
      const violations = await scan();
      if (violations.length) {
        failed = true;
        console.log(`FAIL  ${label}`);
        for (const v of violations) console.log(`        ${v.impact} ${v.id}: ${v.help} (${v.nodes.length} node(s)) ${v.nodes[0]?.target.join(" ") ?? ""}`);
      } else {
        console.log(`PASS  ${label}`);
      }
    } catch (e) {
      failed = true;
      console.log(`FAIL  ${label}: ${e.message}`);
    }
  }
}

// Self-test: the scan must catch planted violations, including inside the shadow root.
const editorStory = stories.find((s) => s.id.startsWith("editor-codeeditor--default")) ?? stories[0];
await open(editorStory.id, "light");
await page.evaluate(() => {
  const light = document.createElement("button");
  light.id = "planted-light";
  document.querySelector("#storybook-root").append(light); // button-name (critical)
  const shadow = document.querySelector('[data-testid="code-editor"] div')?.shadowRoot;
  if (shadow) {
    const inner = document.createElement("button");
    inner.id = "planted-shadow";
    shadow.append(inner);
  }
});
const planted = (await scan()).flatMap((v) => v.nodes.map((n) => JSON.stringify(n.target)));
const caughtLight = planted.some((t) => t.includes("planted-light"));
const caughtShadow = planted.some((t) => t.includes("planted-shadow"));
if (caughtLight && caughtShadow) {
  console.log("PASS  self-test: planted violations caught (light DOM + editor shadow root)");
} else {
  failed = true;
  console.log(`FAIL  self-test: scanner missed planted violations (light DOM: ${caughtLight}, shadow root: ${caughtShadow})`);
}

await browser.close();
server.close();
console.log(failed ? "storybook a11y: FAILED" : `storybook a11y: ${stories.length} stories × ${THEMES.length} themes clean`);
process.exit(failed ? 1 : 0);
