import { mergeEvents, type LocalStore, type StoredEvent } from "@educrs/core";

/** In-memory LocalStore: tests, Storybook, and the fallback when IndexedDB is unavailable. */
export class MemoryStore implements LocalStore {
  #events = new Map<string, StoredEvent>();
  #synced = new Set<string>();
  readonly #dev: string;

  constructor(deviceId = "memory-device") {
    this.#dev = deviceId;
  }

  async deviceId(): Promise<string> {
    return this.#dev;
  }

  async append(events: readonly StoredEvent[]): Promise<void> {
    for (const e of events) if (!this.#events.has(e.id)) this.#events.set(e.id, e);
  }

  async all(): Promise<StoredEvent[]> {
    return mergeEvents([...this.#events.values()]);
  }

  async unsynced(): Promise<StoredEvent[]> {
    return (await this.all()).filter((e) => !this.#synced.has(e.id));
  }

  async markSynced(ids: readonly string[]): Promise<void> {
    for (const id of ids) if (this.#events.has(id)) this.#synced.add(id);
  }
}
