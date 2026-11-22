import { describe, expect, it } from "vitest";
import type { StoredEvent } from "@educrs/core";
import { EXPORT_FORMAT, exportFile } from "./export.ts";

const ev = (id: string, t: number): StoredEvent => ({ id, t, tz: 180, dev: "d1", type: "lesson.completed", v: 1, rs: 1, p: { lessonId: "lesson:x" } });

describe("download my data (docs/05-f3-mvp0.md §15.6)", () => {
  it("writes every event once, in canonical (t, id) order, with the envelope untouched", () => {
    const a = ev("b", 2);
    const b = ev("a", 2);
    const c = ev("c", 1);
    const file = exportFile([a, b, c, a], { device: "d1", now: Date.UTC(2026, 10, 22, 9), tz: 180 });
    const doc = JSON.parse(file.json);
    expect(doc).toMatchObject({ format: EXPORT_FORMAT, version: 1, exportedAt: "2026-11-22T09:00:00.000Z", device: "d1" });
    expect(doc.events).toEqual([c, b, a]);
  });

  it("names the file after the learner's local date", () => {
    const lateEvening = Date.UTC(2026, 10, 22, 22, 30); // 01:30 on the 23rd in UTC+3
    expect(exportFile([], { device: "d", now: lateEvening, tz: 180 }).filename).toBe("educrs-progress-2026-11-23.json");
    expect(exportFile([], { device: "d", now: lateEvening, tz: 0 }).filename).toBe("educrs-progress-2026-11-22.json");
  });
});
