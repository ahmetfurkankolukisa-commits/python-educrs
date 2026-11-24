/**
 * The learner's events for a page: opens the local store, builds the event context (clock, time
 * zone, device) and keeps every event in memory, including the ones this page writes. Shared by
 * the lesson, path and settings pages (docs/05-f3-mvp0.md §15.7).
 */
import { settingsOf } from "@educrs/gamification";
import { applyTheme } from "./theme.ts";
import { monotonic, newEvent, type EventContext, type StoredEvent } from "@educrs/core";
import { openLocalStore } from "@educrs/store";

/** Minutes east of UTC right now (the `tz` of new events, plan §3.5.4). */
export const localTz = () => -new Date().getTimezoneOffset();
export const nowLocal = () => ({ t: Date.now(), tz: localTz() });

export interface Progress {
  /** False when the browser keeps nothing (e.g. some private windows): progress lasts this visit only. */
  readonly persistent: boolean;
  readonly device: string;
  /** Every event so far, in canonical order, including those written by record(). */
  events(): readonly StoredEvent[];
  /** Write an event. Storage failing never stops the learner; the event still counts for this visit. */
  record(type: string, p: Record<string, unknown>): Promise<StoredEvent>;
}

export async function openProgress(): Promise<Progress> {
  const { store, persistent } = await openLocalStore();
  const device = await store.deviceId();
  const ctx: EventContext = {
    now: monotonic(() => Date.now()),
    tz: localTz,
    dev: device,
    random: () => crypto.getRandomValues(new Uint8Array(10)),
  };
  let events: StoredEvent[] = await store.all();
  // The events are the truth about the theme; the copy that paints the next page first is only a
  // mirror. Put it right whenever the events are read (it may have been cleared, or be stale).
  applyTheme(settingsOf(events).theme);
  return {
    persistent,
    device,
    events: () => events,
    async record(type, p) {
      const e = newEvent(ctx, type, p);
      events = [...events, e];
      try {
        await store.append([e]);
      } catch {
        // Not saved; the learner carries on and this visit still counts it.
      }
      return e;
    },
  };
}
