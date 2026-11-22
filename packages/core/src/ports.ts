/**
 * Ports (plan §2.3): the ONLY way the core talks to the outside world.
 * Adapters (Pyodide, Firestore, Firebase Auth, Dexie, Remote Config, Gemini…)
 * implement these in their own packages. Every port must have at least two
 * implementations (one real, one in-memory/fake) — single-implementation
 * abstractions tend to be wrong.
 */
import type { StoredEvent } from "./events.ts";

// ------------------------------------------------------------------ code execution
export interface RunRequest {
  readonly code: string;
  readonly mode: "run" | "check" | "trace" | "explain";
  /** Values to feed input() when the runtime cannot block (prefill fallback). */
  readonly prefilledInput?: readonly string[];
}

export interface RunResult {
  readonly status: "ok" | "error" | "interrupted" | "timeout";
  readonly stdout: string;
  readonly stderr: string;
  /** Learner-facing traceback (user frames only). */
  readonly error: string | null;
  /** Mode-specific JSON payload (trace data, explained error, grade). */
  readonly extra: string | null;
  readonly durationMs: number;
}

export interface RuntimeCapabilities {
  /** "sync" = blocking input() works; "prefill" = values must be supplied up front. */
  readonly stdin: "sync" | "prefill";
  readonly trace: boolean;
  readonly interrupt: boolean;
  readonly graphics: boolean;
}

export interface LanguageRuntime {
  readonly id: string;
  readonly capabilities: () => RuntimeCapabilities;
  load(onProgress?: (fraction: number) => void): Promise<void>;
  run(req: RunRequest, io: { onStdout(text: string): void; onStderr(text: string): void; onInput(prompt: string): Promise<string> }): Promise<RunResult>;
  interrupt(): void;
}

// ------------------------------------------------------------------ persistence & sync
export interface LocalStore {
  /** Stable random id of this device/browser profile, created on first use (event `dev`). */
  deviceId(): Promise<string>;
  /** Idempotent: appending an event whose id is already stored changes nothing (G-Set). */
  append(events: readonly StoredEvent[]): Promise<void>;
  all(): Promise<StoredEvent[]>;
  unsynced(): Promise<StoredEvent[]>;
  markSynced(ids: readonly string[]): Promise<void>;
}

export interface EncodedBatch {
  readonly id: string;
  readonly dev: string;
  readonly payload: Uint8Array;
  readonly count: number;
  /** Server time (ms) assigned on write; the pull cursor is based on this. */
  readonly createdAt?: number;
  readonly covers?: readonly string[];
}

export interface SyncBackend {
  push(batch: EncodedBatch): Promise<void>;
  /** Returns batches with createdAt >= cursor - overlap, ordered by createdAt (plan §3.6). */
  pull(cursorMs: number): Promise<EncodedBatch[]>;
  remove(batchIds: readonly string[]): Promise<void>;
}

export interface AuthUser {
  readonly uid: string;
  readonly provider: "google" | "github";
}

export interface AuthProvider {
  current(): AuthUser | null;
  onChange(cb: (user: AuthUser | null) => void): () => void;
  signIn(provider: AuthUser["provider"]): Promise<AuthUser>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
}

export interface FeatureFlags {
  enabled(flag: string): boolean;
}

// ------------------------------------------------------------------ learning
export interface ConceptGraph {
  readonly prereqs: ReadonlyMap<string, readonly string[]>;
}

export interface Recommendation {
  readonly conceptId: string;
  readonly exerciseId: string;
  readonly reason: "review" | "new" | "remediation";
}

export interface LearnerModel<S> {
  readonly id: string;
  initial(): S;
  /** Pure: same state + event => same result. */
  apply(state: S, event: StoredEvent): S;
  recommend(state: S, graph: ConceptGraph, nowMs: number): Recommendation | null;
}

// ------------------------------------------------------------------ exercises
export interface GradeResult {
  readonly passed: boolean;
  readonly messages: readonly string[];
  readonly misconceptionId?: string;
  /** Seed used for random tests; stored in the attempt event (plan §3.2). */
  readonly seed?: number;
}

export interface ExerciseTypePlugin<Spec, Answer> {
  /** e.g. "code", "parsons", "predict-output", "verbatim" */
  readonly type: string;
  /** Validates authored content at build time. */
  parseSpec(raw: unknown): Spec;
  grade(spec: Spec, answer: Answer, runtime: LanguageRuntime): Promise<GradeResult>;
}

// ------------------------------------------------------------------ tutor (K11)
export interface TutorContext {
  readonly exerciseId: string;
  readonly code: string;
  readonly error: string | null;
  readonly hintsUsed: number;
}

export interface TutorProvider {
  /** "on-device" | "firebase-ai" */
  readonly id: string;
  /** Browser support, quota state and the age/account rule (under-13 / guests: on-device only). */
  available(): Promise<boolean>;
  ask(ctx: TutorContext): AsyncIterable<string>;
}
