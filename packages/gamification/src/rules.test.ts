import { describe, expect, it } from "vitest";
import { EVENT } from "@educrs/core";
import { DAY0, ev, finish, noon, solve } from "./testing.ts";
import { rulesFor } from "./rules.ts";
import { xpOf } from "./xp.ts";

// FROZEN. Ruleset 1 is a promise to learners (plan §3.5.6): replaying their history must give the
// same XP forever. If this test fails you changed ruleset 1 — revert, and add ruleset 2 instead.
describe("ruleset 1 is frozen", () => {
  it("values this fixed history exactly as when it was released", () => {
    const history = [
      solve("ex:a", noon(0, 1), { difficulty: "easy" }),
      solve("ex:a", noon(0, 2), { difficulty: "easy" }),
      solve("ex:a", noon(0, 3), { difficulty: "easy", reveal: 1 }),
      solve("ex:b", noon(0, 4), { difficulty: "medium", hints: 1 }),
      solve("ex:c", noon(0, 5), { difficulty: "hard", hints: 2 }),
      finish("lesson:x", noon(0, 6)),
      finish("lesson:x", noon(0, 7)),
      solve("ex:c", noon(1, 1), { difficulty: "hard", hints: 3 }),
      solve("ex:d", noon(1, 2)),
      solve("ex:d", noon(1, 3), { correct: false }),
      finish("lesson:x", noon(1, 4)),
      solve("ex:e", noon(1, 5), { rs: 2 }),
      solve("ex:f", noon(1, 6), { difficulty: "hard", reveal: 0.5 }),
      solve("ex:g", Date.UTC(2026, 10, 2, 22, 30), { difficulty: "easy", hints: 1, tz: 180 }),
      ev(EVENT.settingsChanged, { dailyGoal: 30 }, { t: noon(1, 7) }),
    ];
    const xp = xpOf(history);
    // day 0: ex:a 10+5+1, ex:b 11, ex:c 10, lesson 5+2 — day 1: ex:c 10, ex:d 10, lesson 5, ex:f 5 — day 2: ex:g 7
    expect(Object.fromEntries([...xp.byDay].map(([d, n]) => [d - DAY0, n]))).toEqual({ 0: 44, 1: 30, 2: 7 });
    expect(xp.total).toBe(81);
  });

  it("ranked(): full, half, quarter… rounded down, at least 1, safe for any rank", () => {
    const r = rulesFor(1)!;
    expect([1, 2, 3, 4, 5].map((k) => r.ranked(80, k))).toEqual([20, 10, 5, 2, 1]);
    expect(r.ranked(80, 1_000_000)).toBe(1);
  });
});
