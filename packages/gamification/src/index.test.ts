import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { DAY_MS, dayOf, progressOf } from "./index.ts";
import { DAY0, aShuffledHistory, finish, noon, setGoal, solve } from "./testing.ts";

const lesson = (d: number, tz = 0) => [
  ...["ex:p", "ex:f", "ex:v", "ex:c"].map((id, i) => solve(id, noon(d, i), { tz })),
  finish("lesson:vars.use", noon(d, 9), tz),
];

describe("progressOf (docs/05-f3-mvp0.md §15)", () => {
  it("a brand-new learner", () => {
    const p = progressOf([], { t: noon(0), tz: 0 });
    expect(p).toMatchObject({ xp: 0, today: DAY0, todayXp: 0, goal: 20, settings: { plainMode: false, goalChosen: false } });
    expect(p.streak).toMatchObject({ days: 0, todayMet: false });
  });

  it("the first lesson (4 easy exercises + completion = 45 XP) reaches the default goal: a 1-day streak", () => {
    const p = progressOf(lesson(0), { t: noon(0, 30), tz: 0 });
    expect(p).toMatchObject({ xp: 45, todayXp: 45, goal: 20 });
    expect(p.streak).toMatchObject({ days: 1, todayMet: true });
  });

  it("the next day: the streak still shows 1 until today's goal is reached", () => {
    const yesterday = lesson(0);
    expect(progressOf(yesterday, { t: noon(1), tz: 0 }).streak).toMatchObject({ days: 1, todayMet: false });
    const p = progressOf([...yesterday, ...lesson(1)], { t: noon(1, 30), tz: 0 });
    expect(p.streak).toMatchObject({ days: 2, todayMet: true });
    expect(p.xp).toBe(90); // the next day, the same lesson is worth full XP again
  });

  it("raising the goal after reaching it does not take today away", () => {
    const p = progressOf([...lesson(0), setGoal(50, noon(0, 40))], { t: noon(0, 41), tz: 0 });
    expect(p).toMatchObject({ goal: 20, todayXp: 45, settings: { dailyGoal: 50 } });
    expect(p.streak.todayMet).toBe(true);
    expect(progressOf([...lesson(0), setGoal(50, noon(0, 40))], { t: noon(1), tz: 0 }).goal).toBe(50);
  });

  it("travelling: each event keeps its own local date, and after flying west 'today' is the newest date", () => {
    // Lesson at 01:30 on day 1 in UTC+3 (22:30 UTC on day 0), then "now" is 18:00 on day 0 in UTC−5.
    const t = DAY0 * DAY_MS + DAY_MS - 90 * 60_000;
    expect(dayOf(t, 180)).toBe(DAY0 + 1);
    const p = progressOf(lesson(0, 0).map((e) => ({ ...e, t, tz: 180 })), { t: t + 60_000, tz: -300 });
    expect(p.today).toBe(DAY0 + 1);
    expect(p.streak.todayMet).toBe(true);
  });

  it("is a function of the event set: the same events in any order give the same progress", () => {
    fc.assert(fc.property(aShuffledHistory(), ([h, shuffled]) => {
      const now = { t: noon(25), tz: 0 };
      expect(progressOf(shuffled, now)).toEqual(progressOf(h, now));
    }));
  });
});
