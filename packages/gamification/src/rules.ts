/**
 * Reward rules, versioned and APPEND-ONLY (plan §3.5.6, docs/05-f3-mvp0.md §15.2).
 *
 * Every event carries the ruleset that was active when it was written (`rs`), and is always
 * valued by THAT ruleset, so replaying history gives the same XP forever. To change a rule, add
 * ruleset 2 here and bump REWARD_RULESET in @educrs/core — never edit ruleset 1. The frozen
 * table in rules.test.ts fails if ruleset 1 changes.
 */
import { EVENT, type StoredEvent } from "@educrs/core";

/** What one event earned before the same-day repeat discount: a group key and a value in quarter-XP. */
export interface RewardItem {
  /** Same key + same day = repeats of the same thing ("ex:<id>", "lesson:<id>"). */
  readonly key: string;
  /** Value × 4, so the ¾ and ¼ multipliers stay whole numbers. */
  readonly quarters: number;
}

export interface RewardRules {
  item(e: StoredEvent): RewardItem | null;
  /**
   * XP for the item ranked `rank` (1 = most valuable) among the same day's items with the same
   * key. Ranking by value, not by time, keeps a day's total independent of arrival order and
   * never lower after an event is added (§15.2 has the proof; xp.test.ts checks it).
   */
  ranked(quarters: number, rank: number): number;
}

const BASE = { easy: 10, medium: 15, hard: 20 } as const;
const LESSON_XP = 5;

/** ¼ after "Show me"; otherwise 0 hints → 1, 1 hint → ¾, 2 or more (or unreadable) → ½. In quarters. */
function multiplierQuarters(hints: unknown, revealRatio: unknown): number {
  if (typeof revealRatio === "number" && revealRatio > 0) return 1;
  if (hints === 0) return 4;
  if (hints === 1) return 3;
  return 2;
}

const ruleset1: RewardRules = {
  item(e) {
    if (e.type === EVENT.attempt) {
      const id = e.p.exerciseId;
      if (e.p.correct !== true || typeof id !== "string" || id === "") return null;
      const d = e.p.difficulty;
      // Read from the event, never from today's content: a later difficulty edit must not change past XP.
      const base = d === "medium" || d === "hard" ? BASE[d] : BASE.easy;
      return { key: `ex:${id}`, quarters: base * multiplierQuarters(e.p.hints, e.p.revealRatio) };
    }
    if (e.type === EVENT.lessonCompleted) {
      const id = e.p.lessonId;
      return typeof id === "string" && id !== "" ? { key: `lesson:${id}`, quarters: LESSON_XP * 4 } : null;
    }
    return null;
  },
  ranked(quarters, rank) {
    // rank 1 → quarters / 4 (full value), rank 2 → / 8 (half), … rounded down, never below 1.
    const shift = rank + 1;
    return Math.max(1, shift > 30 ? 0 : Math.floor(quarters / 2 ** shift));
  },
};

const RULES: ReadonlyMap<number, RewardRules> = new Map([[1, ruleset1]]);

/** The rules for ruleset `rs`, or undefined for a ruleset this build does not know (newer client). */
export function rulesFor(rs: number): RewardRules | undefined {
  return RULES.get(rs);
}

export const KNOWN_RULESETS: readonly number[] = [...RULES.keys()];
