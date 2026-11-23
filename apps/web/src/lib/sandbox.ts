/**
 * Talks to the sandbox site (a different site, plan §3.1) through its iframe — protocol v1
 * (docs/05-f3-mvp0.md §6). Trusts nothing it receives: checks origin and source, accepts only
 * known message types and field shapes. Framework-free so the home Runner and lesson pages share it.
 */

export type SandboxStatus = "loading" | "ready" | "failed";

export interface RunResultMessage {
  readonly status: string;
  readonly error: string | null;
  readonly extra: unknown;
}

export interface RunHandlers {
  stdout(text: string): void;
  stderr(text: string): void;
  stdin(reqId: string): void;
  result(r: RunResultMessage): void;
}

const PROTOCOL = 1;
const HELLO_INTERVAL_MS = 250;
const HELLO_MAX_TRIES = 80; // ~20 s: the sandbox page itself may still be loading
/** The host's own deadline is worker start (45 s) + execution (10 s); give it a little more. */
const CHECK_TIMEOUT_MS = 65_000;

const isStr = (v: unknown): v is string => typeof v === "string";

export class SandboxClient {
  readonly origin: string;
  #frame: HTMLIFrameElement | null = null;
  #acked = false;
  #ready = false;
  #runs = new Map<string, RunHandlers>();
  #checks = new Map<string, (extra: unknown) => void>();
  #onStatus: (s: SandboxStatus, reason?: string) => void = () => {};

  constructor(origin: string) {
    this.origin = origin;
  }

  /** Start the handshake with the sandbox iframe. Returns a cleanup function. */
  attach(frame: HTMLIFrameElement, onStatus: (s: SandboxStatus, reason?: string) => void): () => void {
    this.#frame = frame;
    this.#onStatus = onStatus;
    const onMessage = (e: MessageEvent) => this.#receive(e);
    window.addEventListener("message", onMessage);
    // The sandbox only talks to an origin it has verified, so we introduce ourselves until it answers.
    let tries = 0;
    const timer = setInterval(() => {
      if (this.#acked) { clearInterval(timer); return; }
      if (tries++ >= HELLO_MAX_TRIES) {
        clearInterval(timer);
        if (!this.#ready) this.#onStatus("failed", "the Python sandbox did not answer");
        return;
      }
      this.#post({ type: "hello", protocol: PROTOCOL });
    }, HELLO_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      window.removeEventListener("message", onMessage);
      for (const resolve of this.#checks.values()) resolve(null);
      this.#checks.clear();
      this.#runs.clear();
    };
  }

  run(code: string, handlers: RunHandlers): string {
    const runId = `r-${crypto.randomUUID()}`;
    this.#runs.set(runId, handlers);
    this.#post({ type: "run", runId, code, mode: "run" });
    return runId;
  }

  stdin(runId: string, reqId: string, value: string): void {
    this.#post({ type: "stdin", runId, reqId, value });
  }

  stop(): void {
    this.#post({ type: "stop" });
  }

  /**
   * Grade `code` against an exercise in a FRESH worker (the host guarantees it, plan §3.1).
   * Resolves to the raw grade payload, or null if the sandbox never answered.
   */
  check(code: string, spec: object, seed: number): Promise<unknown> {
    const runId = `c-${crypto.randomUUID()}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => { this.#checks.delete(runId); resolve(null); }, CHECK_TIMEOUT_MS);
      this.#checks.set(runId, (extra) => { clearTimeout(timer); resolve(extra); });
      this.#post({ type: "check", runId, code, spec: JSON.stringify(spec), seed });
    });
  }

  #post(message: Record<string, unknown>) {
    this.#frame?.contentWindow?.postMessage(message, this.origin);
  }

  #receive(e: MessageEvent) {
    if (e.origin !== this.origin || !this.#frame || e.source !== this.#frame.contentWindow) return;
    const m = e.data as Record<string, unknown> | null;
    if (!m || typeof m !== "object" || !isStr(m.type)) return;
    if (m.type === "hello-ack") {
      this.#acked = m.protocol === PROTOCOL;
      return;
    }
    if (m.type === "ready") {
      const caps = (m.caps ?? {}) as Record<string, unknown>;
      if (isStr(caps.fatal)) {
        this.#onStatus("failed", caps.fatal.split("\n")[0] ?? "");
      } else {
        this.#ready = true;
        this.#onStatus("ready");
      }
      return;
    }
    if (!isStr(m.runId)) return;
    const check = this.#checks.get(m.runId);
    if (check) {
      if (m.type === "result") {
        this.#checks.delete(m.runId);
        check(m.extra ?? null);
      }
      return;
    }
    const h = this.#runs.get(m.runId);
    if (!h) return;
    if (m.type === "stdout" && isStr(m.text)) h.stdout(m.text);
    else if (m.type === "stderr" && isStr(m.text)) h.stderr(m.text);
    else if (m.type === "stdin_request" && isStr(m.reqId)) h.stdin(m.reqId);
    else if (m.type === "result") {
      this.#runs.delete(m.runId);
      h.result({ status: isStr(m.status) ? m.status : "error", error: isStr(m.error) ? m.error : null, extra: m.extra ?? null });
    }
  }
}

/** Turn a run/check `extra` payload's explanation into its i18n key + params, if it has one. */
export function explanationOf(extra: unknown): { id: string; lineno: number | null; params: Record<string, string | number> } | null {
  if (!isStr(extra)) return null;
  let data: unknown;
  try { data = JSON.parse(extra); } catch { return null; }
  const e = (data as { explanation?: unknown } | null)?.explanation as { id?: unknown; params?: unknown; lineno?: unknown } | undefined;
  if (!e || !isStr(e.id)) return null;
  const params: Record<string, string | number> = {};
  if (e.params && typeof e.params === "object") {
    for (const [k, v] of Object.entries(e.params as Record<string, unknown>)) if (isStr(v) || typeof v === "number") params[k] = v;
  }
  return { id: e.id, lineno: typeof e.lineno === "number" ? e.lineno : null, params };
}
