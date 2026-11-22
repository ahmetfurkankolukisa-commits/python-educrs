import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { EventRegistry, compareEvents, mergeEvents, type StoredEvent } from "./events.ts";

const ev = (over: Partial<StoredEvent> = {}): StoredEvent => ({
  id: "0190-a", t: 1, tz: 180, dev: "d1", type: "exercise.attempt", v: 1, rs: 1, p: {}, ...over,
});

const arbEvent: fc.Arbitrary<StoredEvent> = fc.record({
  id: fc.uuid(),
  t: fc.integer({ min: 0, max: 1_000 }), // small range => many timestamp ties
  tz: fc.integer({ min: -720, max: 840 }),
  dev: fc.constantFrom("d1", "d2", "d3"),
  type: fc.constantFrom("exercise.attempt", "hint.used", "lesson.completed"),
  v: fc.constant(1),
  rs: fc.constant(1),
  p: fc.constant({}),
});
const arbSet = fc.array(arbEvent, { maxLength: 30 });
const ids = (xs: StoredEvent[]) => xs.map((e) => e.id);

describe("mergeEvents (G-Set CRDT)", () => {
  it("is commutative", () => {
    fc.assert(fc.property(arbSet, arbSet, (a, b) => {
      expect(ids(mergeEvents(a, b))).toEqual(ids(mergeEvents(b, a)));
    }));
  });

  it("is associative", () => {
    fc.assert(fc.property(arbSet, arbSet, arbSet, (a, b, c) => {
      expect(ids(mergeEvents(mergeEvents(a, b), c))).toEqual(ids(mergeEvents(a, mergeEvents(b, c))));
    }));
  });

  it("is idempotent", () => {
    fc.assert(fc.property(arbSet, (a) => {
      const once = mergeEvents(a);
      expect(ids(mergeEvents(once, once))).toEqual(ids(once));
    }));
  });

  it("gives the same order no matter the arrival order", () => {
    fc.assert(fc.property(arbSet, fc.func(fc.integer()), (a, rnd) => {
      const shuffled = [...a].sort((x, y) => rnd(x.id) - rnd(y.id));
      expect(ids(mergeEvents(shuffled))).toEqual(ids(mergeEvents(a)));
    }));
  });

  it("never drops or duplicates an id", () => {
    fc.assert(fc.property(arbSet, arbSet, (a, b) => {
      const merged = ids(mergeEvents(a, b));
      expect(new Set(merged).size).toBe(merged.length);
      expect(new Set(merged)).toEqual(new Set([...ids(a), ...ids(b)]));
    }));
  });
});

describe("compareEvents", () => {
  it("breaks timestamp ties by id", () => {
    expect(compareEvents(ev({ id: "a", t: 5 }), ev({ id: "b", t: 5 }))).toBeLessThan(0);
    expect(compareEvents(ev({ id: "z", t: 4 }), ev({ id: "a", t: 5 }))).toBeLessThan(0);
  });
});

describe("EventRegistry upcasting", () => {
  const reg = new EventRegistry()
    .register("exercise.attempt", 3, {
      1: (p) => ({ ...p, hints: p["hintCount"] ?? 0 }),
      2: (p) => ({ ...p, seed: p["seed"] ?? null }),
    })
    .register("hint.used", 1);

  it("upcasts v1 through the whole chain without touching the stored event", () => {
    const stored = ev({ v: 1, p: { hintCount: 2 } });
    const { event, understood } = reg.upcast(stored);
    expect(understood).toBe(true);
    expect(event.v).toBe(3);
    expect(event.p).toEqual({ hintCount: 2, hints: 2, seed: null });
    expect(stored.v).toBe(1); // never rewritten
  });

  it("returns current-version events as the same object", () => {
    const e = ev({ v: 3, p: { hints: 0, seed: 1 } });
    expect(reg.upcast(e).event).toBe(e);
  });

  it("preserves unknown types and future versions untouched", () => {
    const unknown = ev({ type: "quests.assigned", v: 1 });
    const future = ev({ v: 9 });
    expect(reg.upcast(unknown)).toEqual({ event: unknown, understood: false });
    expect(reg.upcast(future)).toEqual({ event: future, understood: false });
  });

  it("rejects a registration with a gap in the upcaster chain", () => {
    expect(() => new EventRegistry().register("x.y", 3, { 1: (p) => ({ ...p }) })).toThrow(/missing upcaster v2/);
  });

  it("rejects duplicate registrations", () => {
    expect(() => new EventRegistry().register("a.b", 1).register("a.b", 1)).toThrow(/already registered/);
  });
});
