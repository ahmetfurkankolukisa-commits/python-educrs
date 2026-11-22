/**
 * The content bundle (written by tools/content/pipeline.py, schema 2), read at BUILD time by
 * Astro pages. Islands only receive the lesson and exercises they need as props.
 */
import raw from "../../../../content/build/exercises.json";
import type { Bundle, Exercise, Lesson } from "@educrs/core";

export const bundle = raw as unknown as Bundle;
if (bundle.schema !== 2) throw new Error(`content bundle schema ${bundle.schema}; this app reads schema 2 — run \`pnpm content\``);

const lessons = new Map(bundle.lessons.map((l) => [l.id, l]));
const exercises = new Map(bundle.exercises.map((e) => [e.id, e]));

export const lessonById = (id: string): Lesson => {
  const l = lessons.get(id);
  if (!l) throw new Error(`unknown lesson ${id}`);
  return l;
};

/**
 * /learn/<module>/<concept>/ (docs/05-f3-mvp0.md §1), with dots turned into hyphens —
 * /learn/m2/vars-use/ — so no static host mistakes ".use" for a file extension.
 */
export const lessonSlug = (l: Pick<Lesson, "module" | "concept">) => ({ module: l.module.toLowerCase(), concept: l.concept.replaceAll(".", "-") });
export const lessonHref = (l: Pick<Lesson, "module" | "concept">): string => {
  const s = lessonSlug(l);
  return `/learn/${s.module}/${s.concept}/`;
};

export function exercisesOf(l: Lesson): Record<string, Exercise> {
  const out: Record<string, Exercise> = {};
  for (const s of l.steps) {
    if (s.kind !== "exercise") continue;
    const e = exercises.get(s.id);
    if (!e) throw new Error(`${l.id}: unknown exercise ${s.id}`);
    out[s.id] = e;
  }
  return out;
}
