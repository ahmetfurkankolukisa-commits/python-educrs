import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, REQUIRED_PAIRS } from "./contrast.ts";

const css = readFileSync(new URL("./tokens.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

function block(selectorPattern: RegExp): Record<string, string> {
  const m = selectorPattern.exec(css);
  if (!m) throw new Error(`theme block not found: ${selectorPattern}`);
  const start = css.indexOf("{", m.index) + 1;
  const body = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/(--color-[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)].map((x) => [x[1], x[2]]));
}

const themes = {
  light: block(/\[data-theme="light"\]\s*\{/),
  dark: block(/^\[data-theme="dark"\]\s*\{/m),
  "high-contrast": block(/\[data-theme="high-contrast"\]\s*\{/),
};
const darkFromMediaQuery = block(/:root:not\(\[data-theme="light"\]\):not\(\[data-theme="high-contrast"\]\)\s*\{/);

describe("design tokens", () => {
  it("defines the same colour tokens in every theme", () => {
    const keys = Object.keys(themes.light).sort();
    expect(keys.length).toBeGreaterThan(10);
    for (const [name, t] of Object.entries(themes)) expect(Object.keys(t).sort(), name).toEqual(keys);
  });

  it("keeps the two copies of the dark theme identical", () => {
    expect(darkFromMediaQuery).toEqual(themes.dark);
  });

  for (const [name, t] of Object.entries(themes)) {
    for (const [fg, bg, min] of REQUIRED_PAIRS) {
      it(`${name}: ${fg} on ${bg} >= ${min}:1`, () => {
        const ratio = contrastRatio(t[fg] as string, t[bg] as string);
        expect(ratio, `${name} ${fg} ${t[fg]} on ${bg} ${t[bg]} = ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(min);
      });
    }
  }

  it("high-contrast theme reaches WCAG AAA (7:1) for body text", () => {
    expect(contrastRatio(themes["high-contrast"]["--color-text"] as string, themes["high-contrast"]["--color-bg"] as string)).toBeGreaterThanOrEqual(7);
  });
});

describe("contrastRatio", () => {
  it("matches known reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
});
