/**
 * XP, total and per local day (docs/05-f3-mvp0.md §15.2). A pure function of the event SET:
 * the input order and duplicate copies of an event never change the result.
 */
import type { StoredEvent } from "@educrs/core";
import { dayOf } from "./days.ts";
import { rulesFor } from "./rules.ts";

export interface Xp {
  readonly total: number;
  /** Local day number → XP earned that day. Days without XP are absent. */
  readonly byDay: ReadonlyMap<number, number>;
}

export function xpOf(events: readonly StoredEvent[]): Xp {
  // Group by (ruleset, day, key): repeats are discounted within one day and one ruleset only.
  const groups = new Map<string, { rs: number; day: number; quarters: number[] }>();
  const seen = new Set<string>();
  for (const e of events) {
    if (seen.has(e.id)) continue; // G-Set: the same event twice is still one event
    seen.add(e.id);
    const rules = rulesFor(e.rs);
    if (!rules || !Number.isFinite(e.t)) continue;
    const item = rules.item(e);
    if (!item) continue;
    const day = dayOf(e.t, e.tz);
    const k = `${e.rs}|${day}|${item.key}`;
    let g = groups.get(k);
    if (!g) groups.set(k, (g = { rs: e.rs, day, quarters: [] }));
    g.quarters.push(item.quarters);
  }

  const byDay = new Map<number, number>();
  let total = 0;
  for (const g of groups.values()) {
    const rules = rulesFor(g.rs);
    if (!rules) continue;
    let sum = 0;
    g.quarters.sort((a, b) => b - a).forEach((q, i) => { sum += rules.ranked(q, i + 1); });
    byDay.set(g.day, (byDay.get(g.day) ?? 0) + sum);
    total += sum;
  }
  return { total, byDay };
}

/**
 * XP that `part` added to `all`: total(all) − total(all without part). Never negative, because
 * adding events never lowers XP. Used for "+N XP" at the end of a lesson (§15.7).
 */
export function xpGain(all: readonly StoredEvent[], part: readonly StoredEvent[]): number {
  const ids = new Set(part.map((e) => e.id));
  return xpOf(all).total - xpOf(all.filter((e) => !ids.has(e.id))).total;
}
