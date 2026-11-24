import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { EVENT } from "@educrs/core";
import { DAILY_GOALS, DEFAULT_GOAL, THEMES, goalsByDay, settingsOf } from "./settings.ts";
import { DAY0, aHistory, ev, noon, setGoal } from "./testing.ts";

const plain = (on: unknown, t: number) => ev(EVENT.settingsChanged, { plainMode: on }, { t });

describe("settings (docs/05-f3-mvp0.md §15.3)", () => {
  it("defaults: goal 20, plain mode off, no goal chosen yet", () => {
    expect(settingsOf([])).toEqual({ dailyGoal: DEFAULT_GOAL, plainMode: false, goalChosen: false, theme: "system" });
    expect(DEFAULT_GOAL).toBe(20);
    expect(DAILY_GOALS).toEqual([10, 20, 30, 50]);
  });

  it("theme (§17.18): follows the device by default; the last valid choice wins; nonsense is ignored", () => {
    const theme = (value: unknown, t: number) => ev(EVENT.settingsChanged, { theme: value }, { t });
    expect(THEMES).toEqual(["system", "light", "dark", "high-contrast"]);
    expect(settingsOf([theme("dark", noon(0, 1))]).theme).toBe("dark");
    // written later in time wins, whatever order the events arrive in
    expect(settingsOf([theme("high-contrast", noon(0, 3)), theme("dark", noon(0, 1)), theme("light", noon(0, 2))]).theme).toBe("high-contrast");
    // a value this version does not know (a newer app, a damaged event) changes nothing
    for (const junk of ["sepia", "", 3, null, true, { name: "dark" }]) {
      expect(settingsOf([theme("dark", noon(0, 1)), theme(junk, noon(0, 2))]).theme).toBe("dark");
    }
    // going back to the device's own setting is a choice too
    expect(settingsOf([theme("dark", noon(0, 1)), theme("system", noon(0, 2))]).theme).toBe("system");
    // and it does not touch the other settings
    expect(settingsOf([theme("dark", noon(0, 1)), setGoal(30, noon(0, 2))])).toEqual({ dailyGoal: 30, plainMode: false, goalChosen: true, theme: "dark" });
  });

  it("the last value written wins, per field, in (t, id) order — not in arrival order", () => {
    const es = [plain(true, noon(0, 3)), setGoal(30, noon(0, 1)), setGoal(50, noon(0, 2)), plain(false, noon(0, 4))];
    expect(settingsOf(es)).toEqual({ dailyGoal: 50, plainMode: false, goalChosen: true, theme: "system" });
    expect(settingsOf([...es].reverse())).toEqual(settingsOf(es));
    expect(settingsOf([setGoal(30, noon(0, 1)), plain(true, noon(0, 2))])).toEqual({ dailyGoal: 30, plainMode: true, goalChosen: true, theme: "system" });
  });

  it("ignores values it doesn't understand", () => {
    expect(settingsOf([setGoal(25, noon(0)), setGoal("20", noon(0, 1)), plain("yes", noon(0, 2))])).toEqual(settingsOf([]));
  });
});

describe("the goal of a day", () => {
  it("is the smallest goal in effect during that day: lowering helps today, raising starts tomorrow", () => {
    const raised = goalsByDay([setGoal(50, noon(3))]);
    expect([raised(DAY0 + 2), raised(DAY0 + 3), raised(DAY0 + 4)]).toEqual([20, 20, 50]);
    const lowered = goalsByDay([setGoal(10, noon(3))]);
    expect([lowered(DAY0 + 2), lowered(DAY0 + 3), lowered(DAY0 + 4)]).toEqual([20, 10, 10]);
    const both = goalsByDay([setGoal(50, noon(3, 1)), setGoal(30, noon(3, 2))]);
    expect([both(DAY0 + 3), both(DAY0 + 4)]).toEqual([20, 30]);
  });

  it("a goal change never changes an earlier day, and never raises its own day", () => {
    fc.assert(fc.property(aHistory({ days: 6 }), fc.integer({ min: 0, max: 6 }), fc.constantFrom(...DAILY_GOALS), (h, d, goal) => {
      const before = goalsByDay(h);
      const after = goalsByDay([...h, setGoal(goal, noon(d))]);
      for (let day = DAY0 - 1; day < DAY0 + d; day++) expect(after(day)).toBe(before(day));
      expect(after(DAY0 + d)).toBeLessThanOrEqual(before(DAY0 + d));
    }));
  });
});
