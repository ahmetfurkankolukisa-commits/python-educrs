/**
 * Test-only helpers (imported by *.test.ts only, so never part of a page bundle): event builders and
 * fast-check generators for random learning histories.
 */
import fc from "fast-check";
import { EVENT, REWARD_RULESET, type StoredEvent } from "@educrs/core";
import { DAY_MS } from "./days.ts";

/** 2026-11-01T00:00Z — day numbers in tests are offsets from here. */
export const T0 = Date.UTC(2026, 10, 1);
export const DAY0 = T0 / DAY_MS;

let seq = 0;
export function ev(type: string, p: Record<string, unknown>, at: { t: number; tz?: number; rs?: number; id?: string }): StoredEvent {
  return { id: at.id ?? `e${String(++seq).padStart(6, "0")}`, t: at.t, tz: at.tz ?? 0, dev: "d", type, v: 1, rs: at.rs ?? REWARD_RULESET, p };
}

/** Noon UTC of test day `d` (+ minutes). */
export const noon = (d: number, minutes = 0) => T0 + d * DAY_MS + 12 * 3_600_000 + minutes * 60_000;

export const solve = (exerciseId: string, t: number, o: { hints?: number; reveal?: number; difficulty?: string; tz?: number; rs?: number; correct?: boolean } = {}) =>
  ev(EVENT.attempt, {
    exerciseId, lessonId: "lesson:x", step: 1, correct: o.correct ?? true, attempt: 1, hints: o.hints ?? 0, revealRatio: o.reveal ?? 0,
    ...(o.difficulty === undefined ? {} : { difficulty: o.difficulty }),
  }, { t, ...(o.tz === undefined ? {} : { tz: o.tz }), ...(o.rs === undefined ? {} : { rs: o.rs }) });

export const finish = (lessonId: string, t: number, tz = 0) => ev(EVENT.lessonCompleted, { lessonId, contentHash: "h" }, { t, tz });
export const setGoal = (dailyGoal: unknown, t: number, tz = 0) => ev(EVENT.settingsChanged, { dailyGoal }, { t, tz });

/**
 * One random event of a learner's history, on test days 0..`days`; call the result with `i` to get
 * an event with a unique id. Few days and few exercises make same-day repeats common — the case
 * the repeat rule is about (a wide spread hid a broken ranking from the properties, §15.10).
 */
export const anEvent = (days = 24) => fc.record({
  kind: fc.constantFrom("attempt", "attempt", "attempt", "attempt", "lesson", "settings", "other"),
  day: fc.integer({ min: 0, max: days }),
  minute: fc.integer({ min: 0, max: 1439 }),
  tz: fc.constantFrom(0, 180, -300, 330, 840, -720),
  rs: fc.constantFrom(1, 1, 1, 1, 1, 2),
  ex: fc.constantFrom("ex:a", "ex:b", "ex:c"),
  correct: fc.boolean(),
  hints: fc.constantFrom(0, 1, 2, 3),
  reveal: fc.constantFrom(0, 0, 0, 0.5, 1),
  difficulty: fc.constantFrom("easy", "medium", "hard", "nonsense", undefined),
  goal: fc.constantFrom(10, 20, 30, 50),
  plain: fc.boolean(),
}).map((s) => (i: number): StoredEvent => {
  const at = { t: T0 + s.day * DAY_MS + s.minute * 60_000, tz: s.tz, rs: s.rs, id: `r${String(i).padStart(5, "0")}` };
  if (s.kind === "attempt") {
    return ev(EVENT.attempt, {
      exerciseId: s.ex, lessonId: "lesson:x", step: 1, correct: s.correct, attempt: 1, hints: s.hints, revealRatio: s.reveal,
      ...(s.difficulty === undefined ? {} : { difficulty: s.difficulty }),
    }, at);
  }
  if (s.kind === "lesson") return ev(EVENT.lessonCompleted, { lessonId: `lesson:${s.ex}`, contentHash: "h" }, at);
  if (s.kind === "settings") return ev(EVENT.settingsChanged, s.plain ? { plainMode: true } : { dailyGoal: s.goal }, at);
  return ev("something.else", {}, at);
});

/**
 * A random history: unique ids, any order. `size: "max"` matters: fast-check's default size keeps
 * arrays to about 10 items whatever maxLength says, too few for repeats to happen.
 */
export const aHistory = (o: { maxLength?: number; days?: number } = {}) =>
  fc.array(anEvent(o.days), { maxLength: o.maxLength ?? 40, size: "max" }).map((makers) => makers.map((make, i) => make(i)));

/** The same history twice: as generated and shuffled. */
export const aShuffledHistory = (o: { maxLength?: number; days?: number } = {}) =>
  aHistory(o).chain((h) => fc.shuffledSubarray(h, { minLength: h.length, maxLength: h.length }).map((s) => [h, s] as const));
