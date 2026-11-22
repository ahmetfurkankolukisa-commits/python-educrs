import { describe, expect, it } from "vitest";
import { Registry } from "./registry.ts";

describe("Registry", () => {
  it("registers, lists sorted and looks up", () => {
    const r = new Registry<number>("exercise-type").register("parsons", 2).register("code", 1);
    expect(r.keys()).toEqual(["code", "parsons"]);
    expect(r.get("code")).toBe(1);
    expect(r.has("mcq")).toBe(false);
  });

  it("rejects duplicates, bad keys and unknown lookups", () => {
    const r = new Registry<number>("check").register("stdout", 1);
    expect(() => r.register("stdout", 2)).toThrow(/duplicate/);
    expect(() => r.register("Bad Key", 2)).toThrow(/invalid key/);
    expect(() => r.get("nope")).toThrow(/unknown key/);
  });

  it("refuses registration after freeze", () => {
    const r = new Registry<number>("visualizer").freeze();
    expect(() => r.register("heap", 1)).toThrow(/frozen/);
  });
});
