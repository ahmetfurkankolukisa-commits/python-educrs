import type { LocalStore } from "@educrs/core";
import { MemoryStore } from "./memory.ts";

export { MemoryStore };

/**
 * The learner's store: IndexedDB through Dexie, loaded lazily. Falls back to memory when
 * IndexedDB is unavailable (some private-browsing modes) so lessons still work, just unsaved.
 */
export async function openLocalStore(): Promise<{ store: LocalStore; persistent: boolean }> {
  try {
    const { DexieStore } = await import("./dexie.ts");
    return { store: await DexieStore.open(), persistent: true };
  } catch {
    return { store: new MemoryStore(), persistent: false };
  }
}
