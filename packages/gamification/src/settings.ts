/**
 * Learner settings, stored as `settings.changed` events like everything else (so they will sync
 * later) — docs/05-f3-mvp0.md §15.3, §15.5.
 */
import { EVENT, mergeEvents, type StoredEvent } from "@educrs/core";
import { dayOf } from "./days.ts";

export const DAILY_GOALS = [10, 20, 30, 50] as const;
export type DailyGoal = (typeof DAILY_GOALS)[number];
export const DEFAULT_GOAL: DailyGoal = 20;

export const isDailyGoal = (v: unknown): v is DailyGoal => (DAILY_GOALS as readonly unknown[]).includes(v);

export interface Settings {
  readonly dailyGoal: DailyGoal;
  /** Hide XP, streak, goal and celebrations; learning is unchanged (plan §3.5.1 #4). */
  readonly plainMode: boolean;
  /** The learner picked a goal at least once (otherwise we ask after a lesson). */
  readonly goalChosen: boolean;
}

/** Settings events in canonical (t, id) order, duplicates removed. */
const settingEvents = (events: readonly StoredEvent[]) => mergeEvents(events.filter((e) => e.type === EVENT.settingsChanged));

/** Current settings: per field, the last value written wins. Values we don't understand are ignored. */
export function settingsOf(events: readonly StoredEvent[]): Settings {
  let dailyGoal: DailyGoal = DEFAULT_GOAL;
  let plainMode = false;
  let goalChosen = false;
  for (const e of settingEvents(events)) {
    if (isDailyGoal(e.p.dailyGoal)) { dailyGoal = e.p.dailyGoal; goalChosen = true; }
    if (typeof e.p.plainMode === "boolean") plainMode = e.p.plainMode;
  }
  return { dailyGoal, plainMode, goalChosen };
}

/**
 * The goal of each day: the SMALLEST goal in effect at any moment of that day — the goal at its
 * start and every goal picked during it. Lowering the goal helps today at once; raising it
 * only applies from tomorrow, so it can never break today or a past day.
 */
export function goalsByDay(events: readonly StoredEvent[]): (day: number) => DailyGoal {
  const changes = settingEvents(events).flatMap((e) =>
    isDailyGoal(e.p.dailyGoal) && Number.isFinite(e.t) ? [{ day: dayOf(e.t, e.tz), goal: e.p.dailyGoal }] : []);
  return (day) => {
    let goal: DailyGoal = DEFAULT_GOAL;
    for (const c of changes) if (c.day < day) goal = c.goal; // last change before the day: its starting goal
    for (const c of changes) if (c.day === day && c.goal < goal) goal = c.goal;
    return goal;
  };
}
