/**
 * Learning events and what is derived from them (docs/05-f3-mvp0.md §14.5):
 * "continue where you left off" and the learning-path states. Pure functions over the event set.
 */
import { compareEvents, type EventRegistry, type StoredEvent } from "./events.ts";
import type { Lesson, PathModule } from "./content.ts";

export const EVENT = {
  lessonStarted: "lesson.started",
  attempt: "exercise.attempt",
  lessonCompleted: "lesson.completed",
  /** `{ dailyGoal?: 10 | 20 | 30 | 50, plainMode?: boolean }` (docs/05-f3-mvp0.md §15.3). */
  settingsChanged: "settings.changed",
} as const;

/** Reward ruleset active when events are written (plan §3.5.6). Append-only: bump, never edit. */
export const REWARD_RULESET = 1;

export function registerLearningEvents(reg: EventRegistry): EventRegistry {
  return reg
    .register(EVENT.lessonStarted, 1)
    .register(EVENT.attempt, 1)
    .register(EVENT.lessonCompleted, 1)
    .register(EVENT.settingsChanged, 1);
}

// ------------------------------------------------------------------ ids + envelopes
/**
 * UUIDv7 (RFC 9562): 48-bit Unix ms, version 7, 74 random bits. Sorts by time as a string.
 * `random` must hold at least 10 bytes (the caller passes crypto.getRandomValues output).
 */
export function uuidv7(ms: number, random: Uint8Array): string {
  if (!Number.isSafeInteger(ms) || ms < 0 || ms >= 2 ** 48) throw new Error("uuidv7: ms out of range");
  if (random.length < 10) throw new Error("uuidv7: need 10 random bytes");
  const b = new Uint8Array(16);
  let t = ms;
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  b.set(random.subarray(0, 10), 6);
  b[6] = 0x70 | ((b[6] as number) & 0x0f); // version 7
  b[8] = 0x80 | ((b[8] as number) & 0x3f); // variant 10
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export interface EventContext {
  /** Strictly increasing ms (see monotonic()). */
  now(): number;
  /** Minutes east of UTC at the time of writing (streak days, plan §3.5.4). */
  tz(): number;
  readonly dev: string;
  random(): Uint8Array;
}

export function newEvent(ctx: EventContext, type: string, p: Record<string, unknown>): StoredEvent {
  const t = ctx.now();
  return { id: uuidv7(t, ctx.random()), t, tz: ctx.tz(), dev: ctx.dev, type, v: 1, rs: REWARD_RULESET, p };
}

/** Wrap a clock so two events written in the same millisecond still get distinct, ordered times. */
export function monotonic(clock: () => number): () => number {
  let last = -Infinity;
  return () => {
    const t = Math.max(Math.floor(clock()), last + 1);
    last = t;
    return t;
  };
}

// ------------------------------------------------------------------ derived state
const pstr = (e: StoredEvent, k: string): string | undefined => (typeof e.p[k] === "string" ? (e.p[k] as string) : undefined);

/**
 * Where to resume a lesson. `step === lesson.steps.length` means every step was done but the
 * completion was never recorded (e.g. the tab closed) — the caller finishes the lesson.
 * `start: true` means a new `lesson.started` must be written.
 */
export function resumePoint(events: readonly StoredEvent[], lesson: Pick<Lesson, "id" | "contentHash" | "steps">): { step: number; start: boolean } {
  const mine = events.filter((e) => pstr(e, "lessonId") === lesson.id).sort(compareEvents);
  let startIdx = -1;
  mine.forEach((e, i) => { if (e.type === EVENT.lessonStarted) startIdx = i; });
  if (startIdx < 0) return { step: 0, start: true };
  const start = mine[startIdx] as StoredEvent;
  const after = mine.slice(startIdx + 1);
  if (pstr(start, "contentHash") !== lesson.contentHash) return { step: 0, start: true };
  if (after.some((e) => e.type === EVENT.lessonCompleted)) return { step: 0, start: true };
  let best = -1;
  for (const e of after) {
    if (e.type !== EVENT.attempt || e.p.correct !== true) continue;
    const s = e.p.step;
    if (Number.isSafeInteger(s) && (s as number) > best && (s as number) < lesson.steps.length) best = s as number;
  }
  return { step: best + 1, start: false };
}

/**
 * The events of the current run of a lesson: everything for it after its last `lesson.started`
 * (attempts from an earlier visit of a resumed lesson included). Used for "XP this lesson".
 */
export function lessonRun(events: readonly StoredEvent[], lessonId: string): StoredEvent[] {
  const mine = events.filter((e) => pstr(e, "lessonId") === lessonId).sort(compareEvents);
  let startIdx = -1;
  mine.forEach((e, i) => { if (e.type === EVENT.lessonStarted) startIdx = i; });
  return startIdx < 0 ? [] : mine.slice(startIdx + 1);
}

export type NodeState = "completed" | "next" | "todo";

export interface PathNode {
  readonly lessonId: string;
  readonly state: NodeState;
  /** Started and not finished (the "next" node says "Continue" instead of "Start"). */
  readonly inProgress: boolean;
}

/** Learning-path node states (§13.6): completed, the first unfinished lesson is "next", the rest "todo". */
export function pathStates(path: readonly PathModule[], events: readonly StoredEvent[]): PathNode[] {
  const completed = new Set<string>();
  const lastStart = new Map<string, StoredEvent>();
  const lastDone = new Map<string, StoredEvent>();
  for (const e of [...events].sort(compareEvents)) {
    const id = pstr(e, "lessonId");
    if (!id) continue;
    if (e.type === EVENT.lessonCompleted) { completed.add(id); lastDone.set(id, e); }
    if (e.type === EVENT.lessonStarted) lastStart.set(id, e);
  }
  let nextGiven = false;
  return path.flatMap((m) => m.lessons).map((lessonId) => {
    const s = lastStart.get(lessonId);
    const d = lastDone.get(lessonId);
    const inProgress = !!s && (!d || compareEvents(d, s) < 0);
    if (completed.has(lessonId)) return { lessonId, state: "completed" as const, inProgress };
    if (!nextGiven) { nextGiven = true; return { lessonId, state: "next" as const, inProgress }; }
    return { lessonId, state: "todo" as const, inProgress };
  });
}

/** The lesson after `lessonId` in path order, if any. */
export function nextLesson(path: readonly PathModule[], lessonId: string): string | null {
  const all = path.flatMap((m) => m.lessons);
  const i = all.indexOf(lessonId);
  return i >= 0 && i + 1 < all.length ? (all[i + 1] as string) : null;
}
