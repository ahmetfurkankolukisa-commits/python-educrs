/**
 * Streak with freezes (docs/05-f3-mvp0.md §15.4). Walks FORWARD in time, because freezes are
 * earned forward: every 7th streak day earns one, and a missed day spends one.
 *
 *   for each day from the first goal day to today:
 *     goal met                      → streak + 1; every 7th streak day → freeze + 1
 *     it is today                   → nothing (the day is not over)
 *     a freeze, and fewer than 2 missed days in a row so far
 *                                   → spend it: the day is "frozen", the streak holds but does not grow
 *     otherwise                     → the streak ends, and its freezes with it
 *
 * Why "at most 2 missed days in a row" and not the plan's "hold at most 2 freezes": with a cap on
 * holding, a freeze earned at the cap is wasted, and then reaching the goal on one MORE past day
 * (a synced event) could end the streak — 51 days → 0 in the counter-example of §15.4. Limiting the
 * break instead keeps the purpose of the cap (no long break is bridged) and never wastes a freeze.
 *
 * This implementation jumps over the gaps between goal days instead of visiting every day; the
 * day-by-day version above lives in streak.test.ts as the reference it must always agree with.
 */

export const FREEZE_EVERY = 7;
/** A break of up to this many missed days in a row can be frozen; a longer one ends the streak. */
export const MAX_FROZEN_IN_A_ROW = 2;

export interface Streak {
  /** Days in the current streak (frozen days hold it but are not counted). */
  readonly days: number;
  /** Freezes available now (earned in this streak and not spent). */
  readonly freezes: number;
  readonly todayMet: boolean;
  /** First day of the current streak, or null when there is none. */
  readonly start: number | null;
  /** Missed days inside the current streak that a freeze covered. */
  readonly frozen: readonly number[];
}

/** `met`: the days whose goal was reached (day numbers, see days.ts). `today`: the current day. */
export function streakOf(met: Iterable<number>, today: number): Streak {
  const days = [...new Set(met)].filter((d) => d <= today).sort((a, b) => a - b);
  let streak = 0;
  let freezes = 0;
  let start: number | null = null;
  let frozen: number[] = [];

  /** `n` missed days starting at day `from`. */
  const miss = (n: number, from: number) => {
    if (streak === 0 || n <= 0) return;
    if (n <= freezes && n <= MAX_FROZEN_IN_A_ROW) {
      freezes -= n;
      for (let i = 0; i < n; i++) frozen.push(from + i);
    } else {
      // Too few freezes, or too long a break: the streak ends, and its freezes go with it.
      streak = 0;
      freezes = 0;
      start = null;
      frozen = [];
    }
  };

  let prev: number | null = null;
  for (const d of days) {
    if (prev !== null) miss(d - prev - 1, prev + 1);
    if (streak === 0) start = d;
    streak += 1;
    if (streak % FREEZE_EVERY === 0) freezes += 1;
    prev = d;
  }
  const todayMet = prev === today;
  if (prev !== null && !todayMet) miss(today - prev - 1, prev + 1); // today itself is not over yet
  return { days: streak, freezes, todayMet, start: streak > 0 ? start : null, frozen };
}
