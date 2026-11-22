/**
 * "Download my data" (docs/05-f3-mvp0.md §15.6): every event, as they are stored, in one JSON
 * file. Built here as a pure function; the page only turns it into a download. Nothing is sent.
 */
import { mergeEvents, type StoredEvent } from "@educrs/core";
import { dayOf, isoDay } from "@educrs/gamification";

export const EXPORT_FORMAT = "educrs-progress";
export const EXPORT_VERSION = 1;

export interface ExportFile {
  readonly filename: string;
  readonly json: string;
}

export function exportFile(events: readonly StoredEvent[], meta: { readonly device: string; readonly now: number; readonly tz: number }): ExportFile {
  const doc = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date(meta.now).toISOString(),
    device: meta.device,
    events: mergeEvents(events),
  };
  return { filename: `educrs-progress-${isoDay(dayOf(meta.now, meta.tz))}.json`, json: `${JSON.stringify(doc, null, 2)}\n` };
}

/** Save a file the browser way: an object URL and a temporary <a download>. */
export function download(file: ExportFile): void {
  const url = URL.createObjectURL(new Blob([file.json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file.filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
