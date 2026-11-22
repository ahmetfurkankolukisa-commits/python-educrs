/**
 * Gamification for MVP-0 (docs/05-f3-mvp0.md §13.5, map §15): XP, daily goal, streak and the
 * settings behind them. Nothing here is stored — all of it is derived from the event set.
 */
import type { StoredEvent } from "@educrs/core";
import { dayOf } from "./days.ts";
import { goalsByDay, settingsOf, type DailyGoal, type Settings } from "./settings.ts";
import { streakOf, type Streak } from "./streak.ts";
import { xpOf } from "./xp.ts";

export * from "./days.ts";
export * from "./rules.ts";
export * from "./settings.ts";
export * from "./streak.ts";
export * from "./xp.ts";

export interface Progress {
  readonly xp: number;
  /** Today's day number (see days.ts). */
  readonly today: number;
  readonly todayXp: number;
  readonly goal: DailyGoal;
  readonly streak: Streak;
  readonly settings: Settings;
}

/** Everything the UI shows, at instant `now.t` in offset `now.tz` (minutes east of UTC). */
export function progressOf(events: readonly StoredEvent[], now: { readonly t: number; readonly tz: number }): Progress {
  const xp = xpOf(events);
  const goalOf = goalsByDay(events);
  // After flying west, the newest event can be on a later date than "now": that date is today.
  let today = dayOf(now.t, now.tz);
  for (const e of events) if (Number.isFinite(e.t)) today = Math.max(today, dayOf(e.t, e.tz));
  const met = [...xp.byDay].flatMap(([day, n]) => (n >= goalOf(day) ? [day] : []));
  return {
    xp: xp.total,
    today,
    todayXp: xp.byDay.get(today) ?? 0,
    goal: goalOf(today),
    streak: streakOf(met, today),
    settings: settingsOf(events),
  };
}
