/**
 * Shape of the content bundle (`content/build/exercises.json`, schema 2) that the content
 * pipeline writes (tools/content/pipeline.py). The app imports it at build time.
 */

export interface Explanation {
  /** Explainer rule id; the words live in i18n under `explain.<id>` (docs/05-f3-mvp0.md §4). */
  readonly id: string;
  readonly lineno: number | null;
  readonly params: Readonly<Record<string, string | number>>;
}

/** A wrong answer tagged with a misconception, plus what the learner reads. */
export interface Tagged {
  readonly id: string;
  readonly message: string;
}

interface ExerciseBase {
  readonly id: string;
  readonly concept: string;
  readonly difficulty: "easy" | "medium" | "hard";
  readonly title: string;
  /** Markdown. */
  readonly prompt: string;
  readonly hints: readonly string[];
  readonly contentHash: string;
  readonly source: string;
}

export interface CodeExercise extends ExerciseBase {
  readonly type: "code";
  readonly starter: string;
  readonly solution: string;
  readonly check: { readonly kind: "stdout" | "program-with-inputs"; readonly inputs?: readonly string[] };
  readonly misconceptions: readonly (Tagged & { readonly program: string })[];
}

export interface VerbatimExercise extends ExerciseBase {
  readonly type: "verbatim";
  readonly starter: string;
  readonly check: { readonly kind: "verbatim"; readonly target: string };
}

export interface PredictExercise extends ExerciseBase {
  readonly type: "predict-output";
  readonly predict: {
    readonly program: string;
    readonly options: readonly string[];
    readonly answer: string;
    readonly explanation: string;
    readonly option_misconceptions: Readonly<Record<string, Tagged>>;
  };
}

export interface TileFeedback {
  readonly output?: string;
  readonly error?: string;
  readonly explanation?: Explanation;
}

export interface FillExercise extends ExerciseBase {
  readonly type: "fill-gap";
  readonly fill: {
    readonly template: string;
    readonly tiles: readonly string[];
    readonly answer: string;
    readonly explanation: string;
    readonly expected_output: string;
    readonly tile_misconceptions: Readonly<Record<string, Tagged>>;
    readonly tile_feedback: Readonly<Record<string, TileFeedback>>;
  };
}

export type Exercise = CodeExercise | VerbatimExercise | PredictExercise | FillExercise;
/** Exercises graded by the sandbox (always in a fresh worker, plan §3.1). */
export type SandboxExercise = CodeExercise | VerbatimExercise;

export type Step =
  | { readonly kind: "explain"; readonly text: string; readonly example?: string; readonly example_output?: string }
  | { readonly kind: "exercise"; readonly id: string };

export interface Lesson {
  readonly id: string;
  readonly concept: string;
  readonly module: string;
  readonly title: string;
  readonly steps: readonly Step[];
  readonly contentHash: string;
}

export interface PathModule {
  readonly module: string;
  readonly title: string;
  readonly lessons: readonly string[];
}

export interface Bundle {
  readonly schema: number;
  readonly grader: number;
  readonly python: string;
  readonly exercises: readonly Exercise[];
  readonly lessons: readonly Lesson[];
  readonly path: readonly PathModule[];
}

/** The gap marker in fill-gap templates (pipeline GAP). */
export const GAP = "____";

export const isSandboxExercise = (e: Exercise): e is SandboxExercise => e.type === "code" || e.type === "verbatim";
