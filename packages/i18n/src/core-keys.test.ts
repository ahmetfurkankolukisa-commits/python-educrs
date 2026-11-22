import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { catalog } from "./index.ts";

// packages/core may not import i18n (boundary rule), so it names messages by key. Every key it can
// produce must exist here, or a learner would see a raw key instead of a sentence.
describe("message keys used by packages/core", () => {
  const src = readFileSync(new URL("../../core/src/feedback.ts", import.meta.url), "utf8");
  const keys = [...src.matchAll(/key: "([\w.-]+)"/g)].map((m) => m[1] as string);

  it("finds the keys (the scan itself works)", () => {
    expect(keys.length).toBeGreaterThanOrEqual(10);
  });

  it("are all in the English catalog", () => {
    const en = catalog("en") as Record<string, string>;
    expect(keys.filter((k) => !(k in en))).toEqual([]);
  });
});
