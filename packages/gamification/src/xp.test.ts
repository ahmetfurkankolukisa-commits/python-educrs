import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { EVENT, REWARD_RULESET } from "@educrs/core";
import { dayOf } from "./days.ts";
import { KNOWN_RULESETS } from "./rules.ts";
import { DAY0, aHistory, aShuffledHistory, anEvent, ev, finish, noon, solve } from "./testing.ts";
import { xpGain, xpOf } from "./xp.ts";

const one = (e: Parameters<typeof xpOf>[0][number]) => xpOf([e]).total;

describe("XP rules, ruleset 1 (docs/05-f3-mvp0.md §15.2)", () => {
  it("base by difficulty × hint multiplier, rounded down", () => {
    const cases: [string | undefined, number, number, number][] = [
      // difficulty, hints, revealRatio, XP
      ["easy", 0, 0, 10], ["easy", 1, 0, 7], ["easy", 2, 0, 5], ["easy", 3, 0, 5], ["easy", 0, 0.5, 2],
      ["medium", 0, 0, 15], ["medium", 1, 0, 11], ["medium", 2, 0, 7], ["medium", 1, 1, 3],
      ["hard", 0, 0, 20], ["hard", 1, 0, 15], ["hard", 2, 0, 10], ["hard", 0, 1, 5],
      [undefined, 0, 0, 10], ["legendary", 0, 0, 10], // missing or unknown difficulty → easy, the lowest base
    ];
    for (const [difficulty, hints, reveal, xp] of cases) {
      expect(one(solve("ex:a", noon(0), { ...(difficulty ? { difficulty } : {}), hints, reveal })), `${difficulty} ${hints} ${reveal}`).toBe(xp);
    }
  });

  it("unreadable hints count as 2+, a lesson completion is worth 5, wrong answers nothing", () => {
    expect(one(ev(EVENT.attempt, { exerciseId: "ex:a", correct: true, hints: "lots", revealRatio: 0 }, { t: noon(0) }))).toBe(5);
    expect(one(finish("lesson:vars.use", noon(0)))).toBe(5);
    expect(one(solve("ex:a", noon(0), { correct: false }))).toBe(0);
    expect(one(ev(EVENT.attempt, { correct: true, hints: 0 }, { t: noon(0) }))).toBe(0); // no exercise id
  });

  it("repeats on the same day: best first, then half, quarter… never below 1; the next day is full again", () => {
    const same = [0, 1, 2, 3, 4].map((m) => solve("ex:a", noon(0, m)));
    expect(xpOf(same).total).toBe(10 + 5 + 2 + 1 + 1);
    expect(xpOf([...same, solve("ex:a", noon(1))]).byDay.get(DAY0 + 1)).toBe(10);
    // A "Show me" solve and a clean solve on one day: the clean one is ranked first, whatever the order.
    const reveal = solve("ex:a", noon(0, 1), { reveal: 1 });
    const clean = solve("ex:a", noon(0, 2));
    expect(xpOf([reveal, clean]).total).toBe(10 + 1);
    expect(xpOf([clean, reveal]).total).toBe(10 + 1);
  });

  it("the counter-example from §15.2: an older solve arriving later can no longer lower XP", () => {
    const deviceA = solve("ex:hard", noon(0, 30), { difficulty: "hard" }); // 20 XP
    const deviceBOffline = solve("ex:hard", noon(0, 10), { difficulty: "hard", reveal: 1 }); // earlier, with "Show me"
    expect(xpOf([deviceA]).total).toBe(20);
    expect(xpOf([deviceA, deviceBOffline]).total).toBe(20 + 2); // was 5 + 10 = 15 with time-ordered halving
  });

  it("the day is the learner's local date: same instant, different offsets", () => {
    const t = Date.UTC(2026, 10, 20, 22, 30); // 22:30 UTC
    expect([...xpOf([solve("ex:a", t, { tz: 0 })]).byDay.keys()]).toEqual([dayOf(t, 0)]);
    expect([...xpOf([solve("ex:a", t, { tz: 180 })]).byDay.keys()]).toEqual([dayOf(t, 0) + 1]); // 01:30 next day in UTC+3
    expect([...xpOf([solve("ex:a", t, { tz: 99999 })]).byDay.keys()]).toEqual([dayOf(t, 0)]); // not a real offset → UTC
  });

  it("events of an unknown ruleset (a newer app wrote them) count 0 until the app knows it", () => {
    expect(one(solve("ex:a", noon(0), { rs: 99 }))).toBe(0);
    expect(KNOWN_RULESETS).toContain(REWARD_RULESET); // the ruleset we write must be one we can value
  });
});

// Dense histories (3 days, 3 exercises): same-day repeats with different values are common.
const dense = { days: 2 };
/** `h` with `e` inserted at position `at` — a synced event can land anywhere, not just at the end. */
const insert = <T,>(h: readonly T[], e: T, at: number) => [...h.slice(0, at % (h.length + 1)), e, ...h.slice(at % (h.length + 1))];

describe("XP properties (plan §3.5.5)", () => {
  it("is a function of the event SET: input order does not matter", () => {
    fc.assert(fc.property(aShuffledHistory(dense), ([h, shuffled]) => {
      const a = xpOf(h);
      const b = xpOf(shuffled);
      expect(b.total).toBe(a.total);
      expect(new Map([...b.byDay].sort())).toEqual(new Map([...a.byDay].sort()));
    }));
  });

  it("the same event delivered twice counts once (G-Set)", () => {
    fc.assert(fc.property(aHistory(dense), fc.array(fc.nat()), (h, picks) => {
      const dupes = h.length ? picks.map((i) => h[i % h.length]!) : [];
      expect(xpOf([...h, ...dupes])).toEqual(xpOf(h));
    }));
  });

  it("adding any event never lowers the total, nor the XP of ANY day", () => {
    fc.assert(fc.property(aHistory(dense), anEvent(dense.days), fc.nat(), (h, make, at) => {
      const before = xpOf(h);
      const after = xpOf(insert(h, make(99_999), at));
      expect(after.total).toBeGreaterThanOrEqual(before.total);
      for (const [day, n] of before.byDay) expect(after.byDay.get(day) ?? 0).toBeGreaterThanOrEqual(n);
    }), { numRuns: 500 });
  });

  it("an event changes the XP of its own day only (yesterday's goal can't change later)", () => {
    fc.assert(fc.property(aHistory(dense), anEvent(dense.days), fc.nat(), (h, make, at) => {
      const extra = make(99_999);
      const own = dayOf(extra.t, extra.tz);
      const before = xpOf(h).byDay;
      const after = xpOf(insert(h, extra, at)).byDay;
      for (const day of new Set([...before.keys(), ...after.keys()])) {
        if (day !== own) expect(after.get(day)).toBe(before.get(day));
      }
    }), { numRuns: 500 });
  });

  it("wrong answers, unknown event types and unknown rulesets change nothing", () => {
    fc.assert(fc.property(aHistory(dense), fc.integer({ min: 0, max: 2 }), (h, d) => {
      const base = xpOf(h);
      expect(xpOf([...h, solve("ex:a", noon(d), { correct: false })])).toEqual(base);
      expect(xpOf([...h, ev("future.thing", { exerciseId: "ex:a", correct: true }, { t: noon(d) })])).toEqual(base);
      expect(xpOf([...h, solve("ex:a", noon(d), { rs: 2 })])).toEqual(base);
    }));
  });

  it("a single solve is worth 1..20 XP", () => {
    fc.assert(fc.property(anEvent(), (make) => {
      const e = make(0);
      if (e.type === EVENT.attempt) expect(one(e)).toBeLessThanOrEqual(20);
      if (e.type === EVENT.attempt && e.p.correct === true && e.rs === 1) expect(one(e)).toBeGreaterThanOrEqual(1);
    }));
  });

  it("xpGain is total(all) − total(all without the part), never negative", () => {
    fc.assert(fc.property(aHistory(dense), fc.array(fc.boolean(), { maxLength: 40, size: "max" }), (h, mask) => {
      const part = h.filter((_, i) => mask[i]);
      const gain = xpGain(h, part);
      expect(gain).toBe(xpOf(h).total - xpOf(h.filter((_, i) => !mask[i])).total);
      expect(gain).toBeGreaterThanOrEqual(0);
    }));
  });
});
