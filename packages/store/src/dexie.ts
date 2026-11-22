/**
 * IndexedDB LocalStore via Dexie. Loaded LAZILY (dynamic import from index.ts) so Dexie never
 * weighs on first paint (docs/05-f3-mvp0.md §14.1).
 */
import { Dexie, type Table } from "dexie";
import { mergeEvents, type LocalStore, type StoredEvent } from "@educrs/core";

interface Row extends StoredEvent {
  /** 0 = not yet pushed to the cloud, 1 = synced (IndexedDB cannot index booleans). */
  readonly synced: 0 | 1;
}

class Db extends Dexie {
  events!: Table<Row, string>;
  meta!: Table<{ key: string; value: string }, string>;

  constructor(name: string) {
    super(name);
    // Schema versions are append-only, like events: add version(2) for changes, never edit version(1).
    this.version(1).stores({ events: "id, synced", meta: "key" });
  }
}

const strip = ({ synced: _s, ...e }: Row): StoredEvent => e;

export class DexieStore implements LocalStore {
  readonly #db: Db;
  readonly #newId: () => string;

  private constructor(db: Db, newId: () => string) {
    this.#db = db;
    this.#newId = newId;
  }

  static async open(name = "educrs", newId: () => string = () => crypto.randomUUID()): Promise<DexieStore> {
    const db = new Db(name);
    await db.open();
    // Ask the browser not to evict our data under storage pressure (plan §2.2). Best effort.
    void globalThis.navigator?.storage?.persist?.().catch(() => false);
    return new DexieStore(db, newId);
  }

  async deviceId(): Promise<string> {
    return this.#db.transaction("rw", this.#db.meta, async () => {
      const row = await this.#db.meta.get("deviceId");
      if (row) return row.value;
      const value = this.#newId();
      await this.#db.meta.add({ key: "deviceId", value });
      return value;
    });
  }

  async append(events: readonly StoredEvent[]): Promise<void> {
    if (events.length === 0) return;
    await this.#db.transaction("rw", this.#db.events, async () => {
      const existing = new Set((await this.#db.events.bulkGet(events.map((e) => e.id))).flatMap((r) => (r ? [r.id] : [])));
      const fresh = events.filter((e) => !existing.has(e.id));
      // Stored events are never rewritten: an id that is already there is left untouched.
      await this.#db.events.bulkAdd(mergeEvents(fresh).map((e) => ({ ...e, synced: 0 as const })));
    });
  }

  async all(): Promise<StoredEvent[]> {
    return mergeEvents((await this.#db.events.toArray()).map(strip));
  }

  async unsynced(): Promise<StoredEvent[]> {
    return mergeEvents((await this.#db.events.where("synced").equals(0).toArray()).map(strip));
  }

  async markSynced(ids: readonly string[]): Promise<void> {
    await this.#db.transaction("rw", this.#db.events, async () => {
      for (const id of ids) await this.#db.events.update(id, { synced: 1 });
    });
  }

  close(): void {
    this.#db.close();
  }
}
