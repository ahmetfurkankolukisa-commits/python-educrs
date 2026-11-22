/**
 * Event envelope + versioned upcasting (plan §2.3 #1, §3.6).
 *
 * - Stored events are NEVER rewritten. They are upcast on read, one version at a time.
 * - Unknown event types are preserved untouched, so an older client never drops
 *   data written by a newer one (forward compatibility).
 * - The event set is a grow-only set (G-Set CRDT): merging is set union by id,
 *   which is commutative, associative and idempotent.
 */

export interface StoredEvent {
  /** UUIDv7 — globally unique. Never used alone for ordering across devices. */
  readonly id: string;
  /** Client timestamp in ms. */
  readonly t: number;
  /** Time-zone offset in minutes at the moment the event was written (streaks). */
  readonly tz: number;
  /** Device id. */
  readonly dev: string;
  readonly type: string;
  /** Event schema version for this type. */
  readonly v: number;
  /** Reward ruleset version active when the event was written (plan §3.5.6). */
  readonly rs: number;
  readonly p: Readonly<Record<string, unknown>>;
}

export type Upcaster = (payload: Readonly<Record<string, unknown>>) => Record<string, unknown>;

interface TypeSpec {
  readonly current: number;
  /** upcasters[n] turns version n into version n + 1 */
  readonly upcasters: ReadonlyMap<number, Upcaster>;
}

export class EventRegistry {
  readonly #types = new Map<string, TypeSpec>();

  /** Register an event type. `upcasters` must cover every version from 1 to current - 1. */
  register(type: string, current: number, upcasters: Record<number, Upcaster> = {}): this {
    if (this.#types.has(type)) throw new Error(`event type already registered: ${type}`);
    if (!Number.isInteger(current) || current < 1) throw new Error(`${type}: current version must be an integer >= 1`);
    const map = new Map<number, Upcaster>();
    for (let v = 1; v < current; v++) {
      const up = upcasters[v];
      if (!up) throw new Error(`${type}: missing upcaster v${v} -> v${v + 1}`);
      map.set(v, up);
    }
    this.#types.set(type, { current, upcasters: map });
    return this;
  }

  knows(type: string): boolean {
    return this.#types.has(type);
  }

  /**
   * Bring an event to the current schema version.
   * Unknown types and versions newer than we understand are returned unchanged (and marked).
   */
  upcast(e: StoredEvent): { event: StoredEvent; understood: boolean } {
    const spec = this.#types.get(e.type);
    if (!spec || e.v > spec.current) return { event: e, understood: false };
    let p: Readonly<Record<string, unknown>> = e.p;
    for (let v = e.v; v < spec.current; v++) {
      p = (spec.upcasters.get(v) as Upcaster)(p);
    }
    return { event: p === e.p ? e : { ...e, v: spec.current, p }, understood: true };
  }
}

/** Total, deterministic order: (t, id). Same set => same order on every device. */
export function compareEvents(a: StoredEvent, b: StoredEvent): number {
  if (a.t !== b.t) return a.t - b.t;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** G-Set union by id, returned in canonical order. */
export function mergeEvents(...sets: ReadonlyArray<readonly StoredEvent[]>): StoredEvent[] {
  const byId = new Map<string, StoredEvent>();
  for (const set of sets) for (const e of set) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()].sort(compareEvents);
}
