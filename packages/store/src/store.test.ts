import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { LocalStore, StoredEvent } from "@educrs/core";
import { MemoryStore } from "./memory.ts";
import { DexieStore } from "./dexie.ts";

const ev = (id: string, t: number, p: Record<string, unknown> = {}): StoredEvent => ({ id, t, tz: 0, dev: "d", type: "exercise.attempt", v: 1, rs: 1, p });

let n = 0;
const impls: [string, () => Promise<LocalStore>][] = [
  ["MemoryStore", async () => new MemoryStore("dev-1")],
  ["DexieStore", async () => DexieStore.open(`test-${++n}`, () => "dev-1")],
];

// The same contract for every implementation (plan §2.3: every port has two implementations).
describe.each(impls)("LocalStore contract: %s", (_name, make) => {
  it("returns events in canonical (t, id) order whatever order they were appended in", async () => {
    const s = await make();
    await s.append([ev("b", 2), ev("a", 3)]);
    await s.append([ev("c", 1), ev("a2", 2)]);
    expect((await s.all()).map((e) => e.id)).toEqual(["c", "a2", "b", "a"]);
  });

  it("never rewrites a stored event: re-appending an id keeps the original", async () => {
    const s = await make();
    await s.append([ev("x", 1, { correct: true })]);
    await s.append([ev("x", 1, { correct: false }), ev("y", 2)]);
    const all = await s.all();
    expect(all.map((e) => e.id)).toEqual(["x", "y"]);
    expect(all[0]?.p).toEqual({ correct: true });
  });

  it("tracks what has been synced", async () => {
    const s = await make();
    await s.append([ev("a", 1), ev("b", 2), ev("c", 3)]);
    await s.markSynced(["b", "nope"]);
    expect((await s.unsynced()).map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("has a stable device id", async () => {
    const s = await make();
    expect(await s.deviceId()).toBe("dev-1");
    expect(await s.deviceId()).toBe("dev-1");
  });

  it("appending in any batching gives the same set (G-Set)", async () => {
    await fc.assert(fc.asyncProperty(
      fc.uniqueArray(fc.record({ id: fc.uuid(), t: fc.integer({ min: 0, max: 20 }) }), { selector: (e) => e.id, maxLength: 12 }),
      fc.integer({ min: 1, max: 4 }),
      async (raw, chunk) => {
        const events = raw.map((r) => ev(r.id, r.t));
        const one = await make();
        await one.append(events);
        const many = await make();
        for (let i = 0; i < events.length; i += chunk) await many.append([...events.slice(i, i + chunk)].reverse());
        expect((await many.all()).map((e) => e.id)).toEqual((await one.all()).map((e) => e.id));
      },
    ), { numRuns: 25 });
  });
});

describe("DexieStore persistence", () => {
  it("keeps events and the device id across reopening the database", async () => {
    let ids = 0;
    const newId = () => `generated-${++ids}`;
    const first = await DexieStore.open("persist-test", newId);
    const dev = await first.deviceId();
    await first.append([ev("a", 1)]);
    first.close();
    const second = await DexieStore.open("persist-test", newId);
    expect(await second.deviceId()).toBe(dev);
    expect((await second.all()).map((e) => e.id)).toEqual(["a"]);
    expect(ids).toBe(1); // the id was generated once, not on every open
  });
});
