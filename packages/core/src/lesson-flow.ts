/**
 * Lesson flow state machine (docs/05-f3-mvp0.md §13.3, code map §14.3). Pure reducer.
 *
 * Invariants (property-tested in lesson-flow.test.ts):
 * - the step index never goes back;
 * - from every state there is a sequence of actions that reaches "done" (the flow never locks:
 *   after two wrong attempts "reveal" shows the answer);
 * - attempts, hints and reveals reset on every new step;
 * - firstTry[i] is true only when the FIRST check of step i was correct;
 * - a check that never came back ("unavailable") is not an attempt.
 */
import type { Feedback } from "./feedback.ts";

export type StepKind = "explain" | "exercise";
export type Phase = "answering" | "feedback" | "done";

export interface FlowState {
  readonly kinds: readonly StepKind[];
  readonly step: number;
  readonly phase: Phase;
  /** Checks on this step (unavailable checks excluded). */
  readonly attempts: number;
  /** Hints shown on this step. */
  readonly hints: number;
  /** Reveal units shown on this step (options: 1; code: lines). */
  readonly revealed: number;
  readonly feedback: Feedback | null;
  /** Per step: true/false once its first check happened; null for explain steps / not yet checked. */
  readonly firstTry: readonly (boolean | null)[];
}

export type FlowAction =
  | { readonly type: "continue" }
  | { readonly type: "checked"; readonly feedback: Feedback }
  | { readonly type: "retry" }
  | { readonly type: "hint"; readonly available: number }
  | { readonly type: "reveal"; readonly units: number };

/** Attempts needed before "Show me" appears (§13.3). */
export const REVEAL_AFTER = 2;

export function startFlow(kinds: readonly StepKind[], at = 0): FlowState {
  if (kinds.length === 0) throw new Error("a lesson needs at least one step");
  const step = Math.max(0, Math.min(at, kinds.length));
  return {
    kinds,
    step: Math.min(step, kinds.length - 1),
    phase: step >= kinds.length ? "done" : "answering",
    attempts: 0,
    hints: 0,
    revealed: 0,
    feedback: null,
    firstTry: kinds.map(() => null),
  };
}

export const canReveal = (s: FlowState): boolean =>
  s.phase !== "done" && s.kinds[s.step] === "exercise" && s.attempts >= REVEAL_AFTER;

function advance(s: FlowState): FlowState {
  if (s.step + 1 >= s.kinds.length) return { ...s, phase: "done", feedback: null };
  return { ...s, step: s.step + 1, phase: "answering", attempts: 0, hints: 0, revealed: 0, feedback: null };
}

export function flow(s: FlowState, a: FlowAction): FlowState {
  if (s.phase === "done") return s;
  const exercise = s.kinds[s.step] === "exercise";
  switch (a.type) {
    case "continue":
      if (s.phase === "answering" && !exercise) return advance(s);
      if (s.phase === "feedback" && s.feedback?.tone === "correct") return advance(s);
      return s;
    case "checked": {
      if (s.phase !== "answering" || !exercise) return s;
      if (a.feedback.tone === "unavailable") return { ...s, phase: "feedback", feedback: a.feedback };
      const firstTry = s.attempts === 0 && s.firstTry[s.step] === null
        ? s.firstTry.map((v, i) => (i === s.step ? a.feedback.tone === "correct" : v))
        : s.firstTry;
      return { ...s, phase: "feedback", feedback: a.feedback, attempts: s.attempts + 1, firstTry };
    }
    case "retry":
      if (s.phase === "feedback" && s.feedback?.tone !== "correct") return { ...s, phase: "answering", feedback: null };
      return s;
    case "hint":
      if (s.phase === "answering" && exercise && s.hints < a.available) return { ...s, hints: s.hints + 1 };
      return s;
    case "reveal":
      if (!canReveal(s) || s.feedback?.tone === "correct" || s.revealed >= a.units) return s;
      return { ...s, phase: "answering", feedback: null, revealed: s.revealed + 1 };
  }
}

/** Share of the answer that was revealed on this step, for the attempt event (§3.2). */
export const revealRatio = (s: FlowState, units: number): number => (units > 0 ? Math.min(1, s.revealed / units) : 0);

/** Summary for the completion screen. */
export function summary(s: FlowState): { exercises: number; firstTry: number } {
  let exercises = 0;
  let firstTry = 0;
  s.kinds.forEach((k, i) => {
    if (k !== "exercise") return;
    exercises++;
    if (s.firstTry[i] === true) firstTry++;
  });
  return { exercises, firstTry };
}
