import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Bundle, Exercise, FillExercise, PredictExercise, SandboxExercise } from "./content.ts";
import { checkFeedback, fillFeedback, parseGrade, predictFeedback } from "./feedback.ts";

// The real bundle: these tests break if the pipeline's output and the core's types drift apart.
const bundle = JSON.parse(readFileSync(new URL("../../../content/build/exercises.json", import.meta.url), "utf8")) as Bundle;
const byId = <T extends Exercise>(id: string) => bundle.exercises.find((e) => e.id === id) as T;
const golden = (id: string) => {
  const [concept, slug] = id.slice(3).split("/");
  return JSON.parse(readFileSync(new URL(`../../../content/golden/${concept}/${slug}.json`, import.meta.url), "utf8"));
};

describe("predict-output feedback (§14.4)", () => {
  const ex = byId<PredictExercise>("ex:vars.reassign/predict-copy");
  it("correct → the authored explanation", () => {
    expect(predictFeedback(ex, ex.predict.answer)).toEqual({ tone: "correct", text: ex.predict.explanation });
  });
  it("an option tagged with a misconception → mix-up with its message", () => {
    expect(predictFeedback(ex, "dog")).toMatchObject({ tone: "mixup", misconceptionId: "mc.vars-auto-update", text: expect.stringContaining("at that moment") });
  });
  it("any other option → general wrong (never the answer itself)", () => {
    const f = predictFeedback(ex, "Error");
    expect(f).toEqual({ tone: "wrong", message: { key: "lesson.predict.wrong" } });
  });
});

describe("fill-gap feedback (§13.4)", () => {
  const ex = byId<FillExercise>("ex:vars.use/fill-print-name");
  it("correct tile → explanation", () => {
    expect(fillFeedback(ex, "name").tone).toBe("correct");
  });
  it("tagged tile → mix-up", () => {
    expect(fillFeedback(ex, '"name"')).toMatchObject({ tone: "mixup", misconceptionId: "mc.quoted-name" });
  });
  it("a tile that raises → the explainer's structured explanation", () => {
    expect(fillFeedback(ex, "Name")).toMatchObject({ tone: "wrong", explanation: { id: "name.case", params: { name: "Name", suggestion: "name" } } });
  });
  it("a tile that prints something else → what it prints vs what we need", () => {
    const red = byId<FillExercise>("ex:vars.reassign/fill-new-value");
    expect(fillFeedback(red, '"red"')).toMatchObject({ tone: "wrong", compare: { actual: "red\n", expected: "blue\n" } });
  });
});

describe("sandbox grades → feedback", () => {
  const code = byId<SandboxExercise>("ex:vars.use/greet-by-name");
  const verbatim = byId<SandboxExercise>("ex:vars.use/type-and-check");

  it("uses the CI golden grades as input: solution, starter, misconceptions", () => {
    const g = golden(code.id);
    expect(checkFeedback(code, parseGrade(g.solution))).toMatchObject({ tone: "correct", message: { key: "lesson.code.correct", params: { passed: 8, total: 8 } }, seed: 1 });
    expect(checkFeedback(code, parseGrade(g.starter))).toMatchObject({ tone: "wrong" });
    expect(checkFeedback(code, parseGrade(g.misconceptions["mc.quoted-name"]))).toMatchObject({
      tone: "mixup", misconceptionId: "mc.quoted-name", compare: { expected: "Hello, Ada\n", actual: "Hello, name\n" },
    });
  });

  it("syntax/runtime errors carry the explanation and the line to highlight", () => {
    const grade = parseGrade({ passed: false, problem: "runtime", explanation: { id: "name.typo", lineno: 2, params: { name: "nmae", suggestion: "name" } } });
    expect(checkFeedback(code, grade)).toMatchObject({ tone: "wrong", errorLine: 2, explanation: { id: "name.typo" }, problem: "runtime" });
  });

  it("verbatim: structure mismatch and success have their own messages", () => {
    expect(checkFeedback(verbatim, parseGrade({ passed: false, problem: "structure-mismatch" }))).toMatchObject({ message: { key: "lesson.verbatim.mismatch" } });
    expect(checkFeedback(verbatim, parseGrade({ passed: true }))).toMatchObject({ tone: "correct", message: { key: "lesson.verbatim.correct" } });
  });

  it("a check that never came back is 'unavailable', not wrong", () => {
    expect(checkFeedback(code, null).tone).toBe("unavailable");
  });
});

describe("parseGrade: everything from the sandbox is untrusted", () => {
  it("rejects things that are not grades", () => {
    for (const bad of [null, 7, "nope", "{", [], {}, { passed: "yes" }]) expect(parseGrade(bad)).toBeNull();
  });
  it("drops malformed parts instead of trusting them", () => {
    const g = parseGrade(JSON.stringify({ passed: false, problem: 3, failed: { expected: 1 }, misconception: { id: "x" }, explanation: { id: 5 }, seed: 1.5 }));
    expect(g).toEqual({ passed: false, problem: null, tests_total: 0, tests_passed: 0, seed: null, failed: null, misconception: null, explanation: null, error: null });
  });
  it("keeps only string/number explanation params", () => {
    const g = parseGrade({ passed: false, explanation: { id: "a", lineno: 1, params: { ok: "x", n: 2, bad: { evil: true } } } });
    expect(g?.explanation?.params).toEqual({ ok: "x", n: 2 });
  });
});
