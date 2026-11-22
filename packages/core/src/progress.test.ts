import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { EventRegistry, type StoredEvent } from "./events.ts";
import { EVENT, lessonRun, monotonic, newEvent, nextLesson, pathStates, registerLearningEvents, resumePoint, uuidv7, type EventContext } from "./progress.ts";
import type { PathModule } from "./content.ts";

let clock = 1_000;
const ctx: EventContext = { now: () => ++clock, tz: () => 180, dev: "dev-1", random: () => new Uint8Array(10).fill(7) };
const started = (lessonId: string, contentHash = "h1") => newEvent(ctx, EVENT.lessonStarted, { lessonId, contentHash });
const attempt = (lessonId: string, step: number, correct: boolean) => newEvent(ctx, EVENT.attempt, { lessonId, step, correct, exerciseId: "ex:x/y" });
const completed = (lessonId: string) => newEvent(ctx, EVENT.lessonCompleted, { lessonId, contentHash: "h1" });

const LESSON = { id: "lesson:vars.use", contentHash: "h1", steps: [{ kind: "explain" }, { kind: "exercise" }, { kind: "exercise" }, { kind: "exercise" }] } as never;

describe("uuidv7", () => {
  it("has version 7, the RFC variant, and sorts by time as a string", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 2 ** 48 - 2 }), fc.uint8Array({ minLength: 10, maxLength: 10 }), fc.uint8Array({ minLength: 10, maxLength: 10 }), (ms, r1, r2) => {
      const a = uuidv7(ms, r1);
      const b = uuidv7(ms + 1, r2);
      expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(a < b).toBe(true);
    }));
  });

  it("rejects bad input", () => {
    expect(() => uuidv7(-1, new Uint8Array(10))).toThrow();
    expect(() => uuidv7(1, new Uint8Array(9))).toThrow();
  });
});

describe("event envelope", () => {
  it("monotonic() never repeats or goes back, even when the clock does", () => {
    const times = [5, 5, 4, 9, 9];
    const next = monotonic(() => times.shift() ?? 0);
    expect([next(), next(), next(), next(), next()]).toEqual([5, 6, 7, 9, 10]);
  });

  it("learning events are registered at v1 and carry v, rs, tz, dev", () => {
    const reg = registerLearningEvents(new EventRegistry());
    for (const type of Object.values(EVENT)) expect(reg.knows(type)).toBe(true);
    const e = started("lesson:a");
    expect(e).toMatchObject({ type: "lesson.started", v: 1, rs: 1, tz: 180, dev: "dev-1" });
    expect(reg.upcast(e).understood).toBe(true);
  });
});

describe("lessonRun (§15.7: XP this lesson)", () => {
  it("is empty before the lesson was ever started", () => {
    expect(lessonRun([attempt("lesson:vars.use", 1, true)], "lesson:vars.use")).toEqual([]);
  });

  it("holds the events after the LAST start, earlier visits of a resumed run included, other lessons excluded", () => {
    const old = [started("lesson:vars.use"), attempt("lesson:vars.use", 1, true), completed("lesson:vars.use")];
    const s2 = started("lesson:vars.use");
    const a1 = attempt("lesson:vars.use", 1, true);
    const other = attempt("lesson:vars.reassign", 1, true);
    const a2 = attempt("lesson:vars.use", 2, false);
    const done = completed("lesson:vars.use");
    const run = lessonRun([done, ...old, a2, other, s2, a1], "lesson:vars.use");
    expect(run.map((e) => e.id)).toEqual([a1, a2, done].map((e) => e.id));
  });
});

describe("resumePoint (§14.5)", () => {
  it("starts fresh when the lesson was never opened", () => {
    expect(resumePoint([], LESSON)).toEqual({ step: 0, start: true });
  });

  it("continues after the last correctly answered step", () => {
    const es = [started("lesson:vars.use"), attempt("lesson:vars.use", 1, false), attempt("lesson:vars.use", 1, true), attempt("lesson:vars.use", 2, false)];
    expect(resumePoint(es, LESSON)).toEqual({ step: 2, start: false });
  });

  it("an opened lesson with nothing answered resumes at the first step without a new start", () => {
    expect(resumePoint([started("lesson:vars.use")], LESSON)).toEqual({ step: 0, start: false });
  });

  it("starts over when the content changed since it was opened", () => {
    const es = [started("lesson:vars.use", "OLD"), attempt("lesson:vars.use", 1, true)];
    expect(resumePoint(es, LESSON)).toEqual({ step: 0, start: true });
  });

  it("starts over after the lesson was completed; attempts from the earlier run do not count", () => {
    const es = [started("lesson:vars.use"), attempt("lesson:vars.use", 3, true), completed("lesson:vars.use")];
    expect(resumePoint(es, LESSON)).toEqual({ step: 0, start: true });
    const again = [...es, started("lesson:vars.use")];
    expect(resumePoint(again, LESSON)).toEqual({ step: 0, start: false });
  });

  it("ignores other lessons and is independent of the order events are stored in", () => {
    const es = [started("lesson:vars.use"), started("lesson:other"), attempt("lesson:other", 3, true), attempt("lesson:vars.use", 1, true)];
    fc.assert(fc.property(fc.shuffledSubarray(es, { minLength: es.length, maxLength: es.length }), (shuffled) => {
      expect(resumePoint(shuffled, LESSON)).toEqual({ step: 2, start: false });
    }));
  });

  it("all steps done but no completion recorded → resume past the end (the caller finishes)", () => {
    const es = [started("lesson:vars.use"), attempt("lesson:vars.use", 3, true)];
    expect(resumePoint(es, LESSON).step).toBe(4);
  });
});

describe("pathStates (§13.6)", () => {
  const PATH: PathModule[] = [
    { module: "M1", title: "print", lessons: ["lesson:a", "lesson:b"] },
    { module: "M2", title: "Variables", lessons: ["lesson:c"] },
  ];
  const states = (es: StoredEvent[]) => pathStates(PATH, es).map((n) => `${n.lessonId}:${n.state}${n.inProgress ? "*" : ""}`);

  it("nothing done: the first lesson is next", () => {
    expect(states([])).toEqual(["lesson:a:next", "lesson:b:todo", "lesson:c:todo"]);
  });

  it("finishing a lesson moves 'next' on; a started lesson is marked in progress", () => {
    const es = [started("lesson:a"), completed("lesson:a"), started("lesson:b")];
    expect(states(es)).toEqual(["lesson:a:completed", "lesson:b:next*", "lesson:c:todo"]);
  });

  it("lessons can be done out of order (no locks): next is the first unfinished one", () => {
    expect(states([completed("lesson:b")])).toEqual(["lesson:a:next", "lesson:b:completed", "lesson:c:todo"]);
  });

  it("a completed lesson stays completed when it is replayed", () => {
    const es = [started("lesson:a"), completed("lesson:a"), started("lesson:a")];
    expect(states(es)[0]).toBe("lesson:a:completed*");
  });

  it("nextLesson follows path order across modules", () => {
    expect(nextLesson(PATH, "lesson:b")).toBe("lesson:c");
    expect(nextLesson(PATH, "lesson:c")).toBeNull();
    expect(nextLesson(PATH, "lesson:zzz")).toBeNull();
  });
});
