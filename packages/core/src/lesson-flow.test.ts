import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { canReveal, flow, REVEAL_AFTER, revealRatio, startFlow, summary, type FlowAction, type FlowState, type StepKind } from "./lesson-flow.ts";
import type { Feedback } from "./feedback.ts";

const ok: Feedback = { tone: "correct" };
const bad: Feedback = { tone: "wrong" };
const mix: Feedback = { tone: "mixup", misconceptionId: "mc.x" };
const lost: Feedback = { tone: "unavailable" };
const LESSON: StepKind[] = ["explain", "exercise", "exercise", "exercise"];

const run = (s: FlowState, ...as: FlowAction[]) => as.reduce(flow, s);
const check = (feedback: Feedback): FlowAction => ({ type: "checked", feedback });

describe("lesson flow: transitions (§13.3)", () => {
  it("an explain step continues straight away; exercises need a correct check", () => {
    let s = startFlow(LESSON);
    s = flow(s, { type: "continue" });
    expect(s.step).toBe(1);
    expect(flow(s, { type: "continue" })).toBe(s); // cannot skip an exercise
    s = flow(s, check(ok));
    expect(s.phase).toBe("feedback");
    s = flow(s, { type: "continue" });
    expect([s.step, s.phase, s.attempts]).toEqual([2, "answering", 0]);
  });

  it("wrong and mix-up answers lead to Try again, never to a dead end", () => {
    let s = run(startFlow(LESSON), { type: "continue" }, check(mix));
    expect(s.phase).toBe("feedback");
    expect(flow(s, { type: "continue" })).toBe(s); // Continue only after a correct answer
    s = flow(s, { type: "retry" });
    expect([s.phase, s.attempts, s.feedback]).toEqual(["answering", 1, null]);
    s = run(s, check(bad), { type: "retry" }, check(ok), { type: "continue" });
    expect(s.step).toBe(2);
  });

  it("a check that never came back is not an attempt", () => {
    let s = run(startFlow(LESSON), { type: "continue" }, check(lost));
    expect([s.phase, s.attempts, s.firstTry[1]]).toEqual(["feedback", 0, null]);
    s = run(s, { type: "retry" }, check(ok));
    expect(s.firstTry[1]).toBe(true); // the first REAL check was correct
  });

  it("first-try is decided by the first check only", () => {
    const s = run(startFlow(LESSON), { type: "continue" }, check(bad), { type: "retry" }, check(ok), { type: "continue" }, check(ok), { type: "continue" }, check(ok), { type: "continue" });
    expect(s.phase).toBe("done");
    expect(s.firstTry).toEqual([null, false, true, true]);
    expect(summary(s)).toEqual({ exercises: 3, firstTry: 2 });
  });

  it("hints are capped by what the exercise has", () => {
    let s = run(startFlow(LESSON), { type: "continue" });
    s = run(s, { type: "hint", available: 2 }, { type: "hint", available: 2 }, { type: "hint", available: 2 });
    expect(s.hints).toBe(2);
    expect(flow(startFlow(LESSON), { type: "hint", available: 2 }).hints).toBe(0); // explain step: no hints
  });

  it(`"Show me" appears after ${REVEAL_AFTER} attempts and reveals one unit at a time`, () => {
    let s = run(startFlow(LESSON), { type: "continue" }, check(bad));
    expect(canReveal(s)).toBe(false);
    expect(flow(s, { type: "reveal", units: 3 })).toBe(s);
    s = run(s, { type: "retry" }, check(bad));
    expect(canReveal(s)).toBe(true);
    s = run(s, { type: "reveal", units: 3 }); // from the feedback panel straight to answering
    expect([s.phase, s.revealed]).toEqual(["answering", 1]);
    s = run(s, { type: "reveal", units: 3 }, { type: "reveal", units: 3 }, { type: "reveal", units: 3 });
    expect(s.revealed).toBe(3);
    expect(revealRatio(s, 3)).toBe(1);
  });

  it("resumes at a given step, and past the end means done", () => {
    expect(startFlow(LESSON, 2).step).toBe(2);
    expect(startFlow(LESSON, 4).phase).toBe("done");
    expect(() => startFlow([])).toThrow();
  });
});

// ------------------------------------------------------------------ invariants (property tests)
const arbKinds = fc.array(fc.constantFrom<StepKind>("explain", "exercise"), { minLength: 1, maxLength: 8 });
const arbFeedback = fc.constantFrom<Feedback>(ok, bad, mix, lost);
const arbAction: fc.Arbitrary<FlowAction> = fc.oneof(
  fc.constant<FlowAction>({ type: "continue" }),
  fc.constant<FlowAction>({ type: "retry" }),
  arbFeedback.map((feedback): FlowAction => ({ type: "checked", feedback })),
  fc.integer({ min: 0, max: 3 }).map((available): FlowAction => ({ type: "hint", available })),
  fc.integer({ min: 1, max: 4 }).map((units): FlowAction => ({ type: "reveal", units })),
);

/**
 * A learner who can NEVER find an answer alone: every answer is wrong until the answer has been
 * revealed. If "Show me" did not exist (or never became available) this learner would be stuck,
 * so this is what proves the flow cannot lock (mutation-tested: disabling reveal fails it).
 */
function solve(s: FlowState): FlowState {
  for (let guard = 0; guard < 200 && s.phase !== "done"; guard++) {
    if (s.kinds[s.step] === "explain") { s = flow(s, { type: "continue" }); continue; }
    if (s.phase === "feedback") s = flow(s, s.feedback?.tone === "correct" ? { type: "continue" } : { type: "retry" });
    else if (canReveal(s) && s.revealed < 1) s = flow(s, { type: "reveal", units: 1 });
    else s = flow(s, check(s.revealed >= 1 ? ok : bad));
  }
  return s;
}

describe("lesson flow: invariants", () => {
  it("never goes back a step, and attempts/hints/reveals reset on every new step", () => {
    fc.assert(fc.property(arbKinds, fc.array(arbAction, { maxLength: 60 }), (kinds, actions) => {
      let s = startFlow(kinds);
      for (const a of actions) {
        const next = flow(s, a);
        expect(next.step).toBeGreaterThanOrEqual(s.step);
        if (next.step > s.step) expect([next.attempts, next.hints, next.revealed, next.feedback]).toEqual([0, 0, 0, null]);
        if (next.phase !== "done") expect(next.step).toBeLessThan(kinds.length);
        s = next;
      }
    }));
  });

  it("never locks: from any reachable state a struggling learner still finishes", () => {
    fc.assert(fc.property(arbKinds, fc.array(arbAction, { maxLength: 60 }), (kinds, actions) => {
      const s = solve(actions.reduce(flow, startFlow(kinds)));
      expect(s.phase).toBe("done");
    }));
  });

  it("firstTry[i] is true only if the first counted check of step i was correct", () => {
    fc.assert(fc.property(arbKinds, fc.array(arbAction, { maxLength: 60 }), (kinds, actions) => {
      let s = startFlow(kinds);
      const first: (boolean | null)[] = kinds.map(() => null);
      for (const a of actions) {
        const before = s;
        s = flow(s, a);
        if (a.type === "checked" && s !== before && a.feedback.tone !== "unavailable" && first[before.step] === null) {
          first[before.step] = a.feedback.tone === "correct";
        }
      }
      expect(s.firstTry).toEqual(first);
    }));
  });

  it("done is final", () => {
    fc.assert(fc.property(arbKinds, fc.array(arbAction, { maxLength: 20 }), (kinds, actions) => {
      const done = solve(startFlow(kinds));
      expect(actions.reduce(flow, done)).toBe(done);
    }));
  });
});
