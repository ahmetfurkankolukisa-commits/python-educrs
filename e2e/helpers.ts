import { expect, type Page } from "@playwright/test";

/** Wait until CodeMirror has replaced the textarea fallback. */
export async function editorReady(page: Page) {
  await expect(page.getByTestId("code-editor")).toHaveAttribute("data-ready", "true");
}

/**
 * Replace the editor's content the way a person replaces a whole program: focus, select all, paste.
 * (Typing multi-line code would trigger auto-indent, exactly as it would for a person.)
 *
 * No Backspace: in iOS mode CodeMirror cancels the native Backspace and replays it from a 50 ms
 * timer. Under load the "is it empty yet?" check could run before that timer, the loop retried, and
 * the retry's Backspace then landed AFTER the paste and ate the last character (a full run executed
 * `print("Hi", name` — reproduced deterministically, desktop engines unaffected). Pasting over the
 * selection replaces everything in one step, with no timer.
 * Focus can land a moment after a tap on touch emulation, so the select-all may miss: retry until
 * the editor holds exactly `code` (each retry replaces everything again).
 */
export async function setCode(page: Page, code: string) {
  await editorReady(page);
  const selectAll = `${await modKey(page)}+A`;
  await expect(async () => {
    await page.locator(".cm-content").click();
    await page.keyboard.press(selectAll);
    await page.locator(".cm-content").evaluate(pasteText, code);
    expect(await editorText(page), `editor does not hold the code; focus is on: ${await focusTarget(page)}`).toBe(code);
  }).toPass({ timeout: 15_000 });
}

/**
 * CodeMirror's "Mod" key as CodeMirror sees the platform, not as the test host does. Use it for
 * every editor shortcut (Mod-a, Mod-Enter) instead of Playwright's ControlOrMeta.
 * CodeMirror binds Mod to Cmd on "Mac", and with an iPhone user agent it treats the page as Mac
 * (`mac: ios || /Mac/.test(navigator.platform)` in @codemirror/view). ControlOrMeta follows the
 * HOST OS, so on Linux CI the iPhone project sent Ctrl+A — on "Mac" that is the Emacs-style "go to
 * line start" — nothing was selected and every retry pasted on top of the old code (CI PR #6: +2,
 * +16, +44 lines); Ctrl+Enter likewise did not run. This mirrors CodeMirror's own detection.
 */
export async function modKey(page: Page): Promise<"Meta" | "Control"> {
  const mac = await page.evaluate(() => {
    const safari = /Apple Computer/.test(navigator.vendor);
    const ios = safari && (/Mobile\/\w+/.test(navigator.userAgent) || navigator.maxTouchPoints > 2);
    return ios || /Mac/.test(navigator.platform);
  });
  return mac ? "Meta" : "Control";
}

/** Runs in the page: a paste event carrying `text` (an empty paste deletes the selection). */
function pasteText(el: Element, text: string) {
  const data = new DataTransfer();
  data.setData("text/plain", text);
  const paste = new ClipboardEvent("paste", { bubbles: true, cancelable: true });
  // Firefox's constructor ignores the `clipboardData` option and attaches a fresh, empty
  // DataTransfer (Chromium/WebKit keep ours), so set it explicitly for every engine.
  Object.defineProperty(paste, "clipboardData", { value: data });
  el.dispatchEvent(paste);
}

/** Where keyboard focus is, looking into the editor's shadow root. */
export async function focusTarget(page: Page) {
  return page.evaluate(() => {
    const outer = document.activeElement;
    const inner = outer?.shadowRoot?.activeElement ?? null;
    if (inner?.closest(".cm-editor")) return "editor";
    const name = (el: Element | null) => (el ? `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}` : "nothing");
    return inner ? `${name(outer)} > ${name(inner)}` : name(outer);
  });
}

export async function editorText(page: Page) {
  return page.locator(".cm-content").evaluate((el) => {
    const lines = [...el.querySelectorAll(".cm-line")].map((l) => l.textContent ?? "");
    return lines.join("\n");
  });
}
