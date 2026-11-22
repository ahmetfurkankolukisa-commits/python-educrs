import { describe, expect, it } from "vitest";
import { catalog, format, locales, t } from "./index.ts";

describe("i18n", () => {
  it("looks up and interpolates", () => {
    expect(t("runner.run")).toBe("Run");
    expect(t("runner.failed", { reason: "no WebAssembly" })).toContain("no WebAssembly");
  });

  it("leaves unknown placeholders visible", () => {
    expect(format("Hi {name} {missing}", { name: "Ada" })).toBe("Hi Ada {missing}");
  });

  it("has no empty strings and only well-formed placeholders in any locale", () => {
    for (const loc of locales) {
      for (const [key, value] of Object.entries(catalog(loc))) {
        expect(value.trim(), `${loc}:${key}`).not.toBe("");
        expect(value.replace(/\{\w+\}/g, ""), `${loc}:${key} has a malformed placeholder`).not.toMatch(/[{}]/);
      }
    }
  });

  it("uses namespaced keys", () => {
    for (const key of Object.keys(catalog("en"))) expect(key).toMatch(/^[a-z]+(\.[a-zA-Z]+)+$/);
  });
});
