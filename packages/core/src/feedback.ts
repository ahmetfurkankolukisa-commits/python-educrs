/**
 * What the learner sees after "Check", for every exercise type (docs/05-f3-mvp0.md §14.4).
 * Pure: content + answer (or the sandbox's grade) in, feedback out. Words are either authored
 * content (`text`, markdown) or an i18n key (`message`) — core never holds English sentences.
 */
import type { Explanation, FillExercise, PredictExercise, SandboxExercise, Tagged } from "./content.ts";

export type Tone = "correct" | "mixup" | "wrong" | "unavailable";

export interface Feedback {
  readonly tone: Tone;
  /** Authored markdown: an explanation or a misconception message. */
  readonly text?: string;
  /** Generated message: i18n key + params. */
  readonly message?: { readonly key: string; readonly params?: Readonly<Record<string, string | number>> };
  /** Structured error explanation (i18n `explain.<id>`). */
  readonly explanation?: Explanation;
  /** Editor line to highlight. */
  readonly errorLine?: number | null;
  /** Expected vs actual output, side by side. */
  readonly compare?: { readonly expected: string; readonly actual: string; readonly inputs?: Readonly<Record<string, unknown>> | null };
  readonly misconceptionId?: string;
  /** Grader `problem` (stored in the attempt event). */
  readonly problem?: string;
  /** Seed of the random tests (stored in the attempt event, plan §3.2). */
  readonly seed?: number;
}

export function predictFeedback(ex: PredictExercise, choice: string): Feedback {
  const p = ex.predict;
  if (choice === p.answer) return { tone: "correct", text: p.explanation };
  const tag = p.option_misconceptions[choice];
  if (tag) return { tone: "mixup", text: tag.message, misconceptionId: tag.id };
  return { tone: "wrong", message: { key: "lesson.predict.wrong" } };
}

export function fillFeedback(ex: FillExercise, tile: string): Feedback {
  const f = ex.fill;
  if (tile === f.answer) return { tone: "correct", text: f.explanation };
  const tag = f.tile_misconceptions[tile];
  if (tag) return { tone: "mixup", text: tag.message, misconceptionId: tag.id };
  const fb = f.tile_feedback[tile];
  if (fb?.explanation) return { tone: "wrong", explanation: fb.explanation, problem: "runtime" };
  if (fb?.output !== undefined) {
    return { tone: "wrong", message: { key: "lesson.fill.output" }, compare: { expected: f.expected_output, actual: fb.output }, problem: "wrong-output" };
  }
  return { tone: "wrong", message: { key: "lesson.generic.wrong" } };
}

// ------------------------------------------------------------------ sandbox grades
/** The grader's result (packages/grader/educrs_grader.py `grade`), validated. */
export interface Grade {
  readonly passed: boolean;
  readonly problem: string | null;
  readonly tests_total: number;
  readonly tests_passed: number;
  readonly seed: number | null;
  readonly failed: { readonly inputs: Readonly<Record<string, unknown>> | null; readonly expected: string; readonly actual: string } | null;
  readonly misconception: Tagged | null;
  readonly explanation: Explanation | null;
  readonly error: { readonly type: string; readonly missing?: readonly string[] } | null;
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string";
const int = (v: unknown): v is number => Number.isSafeInteger(v);

function parseExplanation(v: unknown): Explanation | null {
  if (!isObj(v) || !str(v.id)) return null;
  const params: Record<string, string | number> = {};
  if (isObj(v.params)) {
    for (const [k, x] of Object.entries(v.params)) if (str(x) || typeof x === "number") params[k] = x;
  }
  return { id: v.id, lineno: int(v.lineno) ? v.lineno : null, params };
}

/**
 * Validate a grade that arrived from the sandbox (a different site: untrusted input).
 * Returns null when it is not a grade at all.
 */
export function parseGrade(raw: unknown): Grade | null {
  let v = raw;
  if (str(v)) {
    try { v = JSON.parse(v); } catch { return null; }
  }
  if (!isObj(v) || typeof v.passed !== "boolean") return null;
  const f = v.failed;
  const m = v.misconception;
  const e = v.error;
  return {
    passed: v.passed,
    problem: str(v.problem) ? v.problem : null,
    tests_total: int(v.tests_total) ? v.tests_total : 0,
    tests_passed: int(v.tests_passed) ? v.tests_passed : 0,
    seed: int(v.seed) ? v.seed : null,
    failed: isObj(f) && str(f.expected) && str(f.actual)
      ? { inputs: isObj(f.inputs) ? f.inputs : null, expected: f.expected, actual: f.actual }
      : null,
    misconception: isObj(m) && str(m.id) && str(m.message) ? { id: m.id, message: m.message } : null,
    explanation: parseExplanation(v.explanation),
    error: isObj(e) && str(e.type)
      ? { type: e.type, ...(Array.isArray(e.missing) ? { missing: e.missing.filter(str) } : {}) }
      : null,
  };
}

/** Feedback for a sandbox-graded exercise. `grade === null`: the check never came back. */
export function checkFeedback(ex: SandboxExercise, grade: Grade | null): Feedback {
  if (!grade) return { tone: "unavailable", message: { key: "lesson.check.unavailable" } };
  const base: Pick<Feedback, "problem" | "seed"> = {
    ...(grade.problem !== null ? { problem: grade.problem } : {}),
    ...(grade.seed !== null ? { seed: grade.seed } : {}),
  };
  if (grade.passed) {
    return ex.type === "verbatim"
      ? { tone: "correct", message: { key: "lesson.verbatim.correct" }, ...base }
      : { tone: "correct", message: { key: "lesson.code.correct", params: { passed: grade.tests_passed, total: grade.tests_total } }, ...base };
  }
  if (grade.misconception) {
    return { tone: "mixup", text: grade.misconception.message, misconceptionId: grade.misconception.id, ...base, ...compareOf(grade) };
  }
  switch (grade.problem) {
    case "syntax":
    case "runtime":
      return grade.explanation
        ? { tone: "wrong", explanation: grade.explanation, errorLine: grade.explanation.lineno, ...base }
        : { tone: "wrong", message: { key: "lesson.code.error", params: { type: grade.error?.type ?? "Error" } }, ...base };
    case "wrong-output":
      return { tone: "wrong", message: { key: "lesson.code.wrong-output" }, ...base, ...compareOf(grade) };
    case "structure-mismatch":
      return { tone: "wrong", message: { key: "lesson.verbatim.mismatch" }, ...base };
    case "inputs-missing":
      return { tone: "wrong", message: { key: "lesson.code.inputs-missing", params: { names: (grade.error?.missing ?? []).join(", ") } }, ...base };
    default:
      return { tone: "wrong", message: { key: "lesson.generic.wrong" }, ...base };
  }
}

function compareOf(grade: Grade): Pick<Feedback, "compare"> {
  return grade.failed ? { compare: { expected: grade.failed.expected, actual: grade.failed.actual, inputs: grade.failed.inputs } } : {};
}
