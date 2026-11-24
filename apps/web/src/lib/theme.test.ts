import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BAR, PRE_PAINT, THEME_KEY } from "./theme.ts";

// The theme before the first paint (docs/05-f3-mvp0.md §17.18).

const tokens = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../packages/ui/src/tokens.css"), "utf8");
/** --color-bg inside the `[data-theme="<name>"] { … }` block of tokens.css. */
function background(theme: string) {
  const block = new RegExp(`^\\[data-theme="${theme}"\\] \\{([^}]*)\\}`, "m").exec(tokens);
  return /--color-bg:\s*(#[0-9a-fA-F]{6});/.exec(block?.[1] ?? "")?.[1]?.toLowerCase();
}

/** Run the inline script against a stand-in page. */
function run(stored: string | null | Error) {
  const set: Record<string, string> = {};
  const metas = [{ content: "#fff8f1" }, { content: "#16132b" }].map((m) => ({ ...m, setAttribute(_: string, v: string) { this.content = v; } }));
  const localStorage = { getItem: (key: string) => { if (stored instanceof Error) throw stored; return key === THEME_KEY ? stored : null; } };
  const document = { documentElement: { setAttribute: (k: string, v: string) => { set[k] = v; } }, querySelectorAll: () => metas };
  new Function("localStorage", "document", PRE_PAINT)(localStorage, document);
  return { theme: set["data-theme"], bar: metas.map((m) => m.content) };
}

describe("theme", () => {
  it("the browser bar takes each theme's own page background (tokens.css)", () => {
    for (const [theme, colour] of Object.entries(BAR)) expect(background(theme), theme).toBe(colour);
    expect(Object.keys(BAR)).toEqual(["light", "dark", "high-contrast"]);
  });

  it("before the first paint: a chosen theme is set on <html> and on the bar", () => {
    expect(run("high-contrast")).toEqual({ theme: "high-contrast", bar: ["#000000", "#000000"] });
    expect(run("dark")).toEqual({ theme: "dark", bar: ["#16132b", "#16132b"] });
    expect(run("light")).toEqual({ theme: "light", bar: ["#fff8f1", "#fff8f1"] });
  });

  it("nothing chosen, an unknown value or no storage at all: the page stays as the device wants it", () => {
    const untouched = { theme: undefined, bar: ["#fff8f1", "#16132b"] };
    expect(run(null)).toEqual(untouched);
    expect(run("system")).toEqual(untouched);
    expect(run("sepia")).toEqual(untouched);
    expect(run("constructor")).toEqual(untouched); // not a theme, though every object has one
    expect(run(new Error("storage is blocked"))).toEqual(untouched);
  });
});
