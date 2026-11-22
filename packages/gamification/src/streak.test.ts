import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { FREEZE_EVERY, MAX_FROZEN_IN_A_ROW, streakOf, type Streak } from "./streak.ts";

/**
 * The REFERENCE (docs/05-f3-mvp0.md §15.4): visit every day from the first goal day to today.
 * streakOf() skips the gaps in one step; on any set of days both must agree.
 */
function reference(met: readonly number[], today: number): Streak {
  const goal = new Set(met.filter((d) => d <= today));
  let days = 0;
  let freezes = 0;
  let start: number | null = null;
  let frozen: number[] = [];
  if (goal.size === 0) return { days, freezes, todayMet: false, start, frozen };
  let todayMet = false;
  let missedInRow = 0;
  for (let d = Math.min(...goal); d <= today; d++) {
    if (goal.has(d)) {
      if (days === 0) start = d;
      days += 1;
      missedInRow = 0;
      if (days % FREEZE_EVERY === 0) freezes += 1;
      if (d === today) todayMet = true;
    } else if (d === today) {
      // not over yet
    } else if (days > 0 && freezes > 0 && missedInRow < MAX_FROZEN_IN_A_ROW) {
      freezes -= 1;
      missedInRow += 1;
      frozen.push(d);
    } else {
      missedInRow = 0;
      days = 0;
      freezes = 0;
      start = null;
      frozen = [];
    }
  }
  return { days, freezes, todayMet, start, frozen };
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const TODAY = 100;
/**
 * Random goal days up to and including today: either scattered days, or runs of goal days
 * separated by short gaps — runs of 7+ are what earn freezes, and scattered days alone almost never
 * produce them (fast-check keeps arrays short by default; this hid two broken freeze rules, §15.10).
 */
const scattered = fc.uniqueArray(fc.integer({ min: TODAY - 59, max: TODAY }), { maxLength: 60, size: "max" });
const runs = fc.array(fc.tuple(fc.integer({ min: 1, max: 16 }), fc.integer({ min: 1, max: 4 })), { maxLength: 8, size: "max" }).map((parts) => {
  const days: number[] = [];
  let d = TODAY - 99;
  for (const [run, gap] of parts) {
    for (let i = 0; i < run; i++) days.push(d++);
    d += gap;
  }
  return days.filter((x) => x <= TODAY);
});
const aDaySet = fc.oneof(scattered, runs);

describe("streak (docs/05-f3-mvp0.md §15.4)", () => {
  it("no goal days → no streak", () => {
    expect(streakOf([], TODAY)).toEqual({ days: 0, freezes: 0, todayMet: false, start: null, frozen: [] });
  });

  it("today not reached yet: yesterday's streak still stands, the flame is just not lit", () => {
    expect(streakOf([TODAY - 2, TODAY - 1], TODAY)).toMatchObject({ days: 2, todayMet: false, start: TODAY - 2 });
    expect(streakOf([TODAY - 2, TODAY - 1, TODAY], TODAY)).toMatchObject({ days: 3, todayMet: true });
  });

  it("a missed day with no freeze ends the streak", () => {
    expect(streakOf([TODAY - 3, TODAY - 1], TODAY)).toMatchObject({ days: 1, start: TODAY - 1 });
    expect(streakOf([TODAY - 3], TODAY)).toMatchObject({ days: 0, start: null });
  });

  it("every 7 streak days earn a freeze; a frozen day holds the streak without counting", () => {
    expect(streakOf(range(TODAY - 6, TODAY), TODAY)).toMatchObject({ days: 7, freezes: 1 });
    expect(streakOf(range(TODAY - 20, TODAY), TODAY)).toMatchObject({ days: 21, freezes: 3 });
    const oneMiss = [...range(TODAY - 8, TODAY - 2), TODAY]; // 7 days, miss TODAY-1, today
    expect(streakOf(oneMiss, TODAY)).toEqual({ days: 8, freezes: 0, todayMet: true, start: TODAY - 8, frozen: [TODAY - 1] });
  });

  it("two missed days in a row are covered by two freezes; a third ends the streak, however many freezes", () => {
    const twoFreezes = range(TODAY - 20, TODAY - 7); // 14 days → 2 freezes
    expect(streakOf([...twoFreezes, TODAY - 4], TODAY - 4)).toMatchObject({ days: 15, freezes: 0, frozen: [TODAY - 6, TODAY - 5] });
    expect(streakOf([...twoFreezes, TODAY - 3], TODAY - 3)).toMatchObject({ days: 1, start: TODAY - 3, frozen: [] });
    // …and the gap up to today counts too (today itself is not missed yet).
    expect(streakOf(twoFreezes, TODAY - 4)).toMatchObject({ days: 14, freezes: 0, frozen: [TODAY - 6, TODAY - 5] });
    expect(streakOf(twoFreezes, TODAY - 3)).toMatchObject({ days: 0 });
    const fiveFreezes = range(TODAY - 41, TODAY - 7); // 35 days → 5 freezes
    expect(streakOf([...fiveFreezes, TODAY - 3], TODAY - 3)).toMatchObject({ days: 1, freezes: 0, start: TODAY - 3 });
    expect(streakOf([...fiveFreezes, TODAY - 4, TODAY - 1], TODAY)).toEqual({
      days: 37, freezes: 1, todayMet: false, start: TODAY - 41, frozen: [TODAY - 6, TODAY - 5, TODAY - 3, TODAY - 2],
    });
  });

  it("the counter-example to the plan's 'hold at most 2' rule: one more goal day no longer ends a 51-day streak", () => {
    // 20 days, then a weekly rest day for five weeks, then a 2-day break before today. The added day
    // (TODAY − 59) shifts which days earn freezes; with a holding cap of 2 one freeze was wasted and
    // the streak fell from 51 to 0 (found by the property below, shrunk by fast-check).
    const met = [...range(TODAY - 58, TODAY - 39), ...[0, 1, 2, 3].flatMap((w) => range(TODAY - 37 + 8 * w, TODAY - 31 + 8 * w)), ...range(TODAY - 5, TODAY - 3)];
    expect(streakOf(met, TODAY).days).toBe(51);
    expect(streakOf([TODAY - 59, ...met], TODAY).days).toBe(52);
  });

  it("agrees with the day-by-day reference on any set of days", () => {
    fc.assert(fc.property(aDaySet, (met) => {
      expect(streakOf(met, TODAY)).toEqual(reference(met, TODAY));
    }), { numRuns: 1000 });
  });

  it("invariants: 0 ≤ freezes ≤ earned in this streak; no streak → no freezes; streak ≤ goal days; no frozen run > 2", () => {
    fc.assert(fc.property(aDaySet, (met) => {
      const s = streakOf(met, TODAY);
      expect(s.freezes).toBeGreaterThanOrEqual(0);
      expect(s.freezes + s.frozen.length).toBe(Math.floor(s.days / FREEZE_EVERY));
      for (let i = MAX_FROZEN_IN_A_ROW; i < s.frozen.length; i++) expect(s.frozen[i]! - s.frozen[i - MAX_FROZEN_IN_A_ROW]!).toBeGreaterThan(MAX_FROZEN_IN_A_ROW);
      if (s.days === 0) expect([s.freezes, s.start]).toEqual([0, null]);
      expect(s.days).toBeLessThanOrEqual(met.length);
    }));
  });

  it("a missed day inside the streak survives only by spending a freeze (plan §3.5.5)", () => {
    fc.assert(fc.property(aDaySet, (met) => {
      const s = streakOf(met, TODAY);
      if (s.start === null) return;
      const goal = new Set(met);
      const missed = range(s.start, TODAY - 1).filter((d) => !goal.has(d));
      expect(s.frozen).toEqual(missed);
      expect(s.days).toBe(range(s.start, TODAY).filter((d) => goal.has(d)).length);
    }));
  });

  it("reaching the goal on one more day never shortens the streak", () => {
    fc.assert(fc.property(aDaySet, fc.integer({ min: TODAY - 99, max: TODAY }), (met, extra) => {
      expect(streakOf([...met, extra], TODAY).days).toBeGreaterThanOrEqual(streakOf(met, TODAY).days);
    }), { numRuns: 1000 });
  });
});
