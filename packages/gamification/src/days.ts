/**
 * Calendar days for streaks and daily goals (docs/05-f3-mvp0.md §15.4). Every event carries the
 * UTC offset of the moment it was written (`tz`, minutes east of UTC), so its day is the date
 * on the learner's own clock at that place: travelling never moves an old event to another day.
 */

export const DAY_MS = 86_400_000;
/** Real offsets run from UTC−12:00 to UTC+14:00; anything else is not a real offset. */
const MAX_TZ_MINUTES = 14 * 60;

/** A usable offset in minutes, or 0 (UTC) for anything that is not one. */
export function safeTz(tz: unknown): number {
  return Number.isInteger(tz) && Math.abs(tz as number) <= MAX_TZ_MINUTES ? (tz as number) : 0;
}

/** The local calendar day of instant `t` at offset `tz`, as whole days since 1970-01-01 there. */
export function dayOf(t: number, tz: unknown): number {
  return Math.floor((t + safeTz(tz) * 60_000) / DAY_MS);
}

/** "YYYY-MM-DD" of a day number. */
export function isoDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}
