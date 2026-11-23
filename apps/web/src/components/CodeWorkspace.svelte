<script lang="ts">
  // Editor + Run/Stop + input() box + output. Used by the home page Runner and by lesson code
  // steps (which add a Check button). "Run" is always free; "Check" grades in a fresh worker.
  import { catalog, t, type MessageKey } from "@educrs/i18n";
  import { Button, CodeEditor } from "@educrs/ui";
  import { explanationOf, type SandboxClient, type SandboxStatus } from "../lib/sandbox.ts";

  interface Props {
    client: SandboxClient;
    status: SandboxStatus;
    failReason?: string;
    code: string;
    id?: string;
    label?: string;
    /** Line to highlight from a Check result (a Run error highlights its own line). */
    errorLine?: number | null;
    check?: { label: string; onclick: () => void; busy: boolean } | null;
  }
  let { client, status, failReason = "", code = $bindable(), id = "code", label = "Python code", errorLine = null, check = null }: Props = $props();

  // A runaway loop can print without end and freeze the tab: what a PROGRAM prints is capped.
  const MAX_OUTPUT_CHARS = 100_000;
  const MAX_STATUS_CHARS = 10_000;
  let output = $state("");
  let outputTruncated = false;
  let running = $state(false);
  let asking = $state<{ runId: string; reqId: string } | null>(null);
  let runExplanation = $state<{ text: string; lineno: number | null } | null>(null);
  let answer = $state("");
  let answerInput = $state<HTMLInputElement>();
  let runId: string | null = null;

  function appendOutput(text: string) {
    if (outputTruncated) return;
    if (output.length + text.length > MAX_OUTPUT_CHARS) {
      output += `${text.slice(0, Math.max(0, MAX_OUTPUT_CHARS - output.length))}\n${t("runner.outputTruncated")}\n`;
      outputTruncated = true;
      return;
    }
    output += text;
  }
  /**
   * What the learner must always see — the error message, "Stopped." — is never dropped by the cap
   * above (stopping a runaway print loop is exactly when "Stopped." matters). Bounded on its own.
   */
  function appendStatus(text: string) {
    output += text.slice(0, MAX_STATUS_CHARS);
  }

  const shownStatus = $derived(status === "ready" && running ? "running" : status);
  const highlight = $derived(runExplanation?.lineno ?? errorLine);

  function words(extra: unknown) {
    const e = explanationOf(extra);
    if (!e) return null;
    const key = `explain.${e.id}`;
    if (!(key in catalog("en"))) return null;
    return { text: t(key as MessageKey, e.params), lineno: e.lineno };
  }

  export function run() {
    if (status !== "ready" || running) return;
    output = "";
    outputTruncated = false;
    runExplanation = null;
    running = true;
    runId = client.run(code, {
      stdout: appendOutput,
      stderr: appendOutput,
      stdin: (reqId) => {
        if (!runId) return;
        asking = { runId, reqId };
        queueMicrotask(() => answerInput?.focus());
      },
      result: (r) => {
        if (r.status === "error" && r.error) {
          appendStatus(r.error);
          runExplanation = words(r.extra);
        }
        if (r.status === "interrupted") appendStatus(`\n${t("runner.interrupted")}\n`);
        asking = null;
        running = false;
        runId = null;
      },
    });
  }

  function send(ev: SubmitEvent) {
    ev.preventDefault();
    if (!asking) return;
    appendOutput(answer + "\n");
    client.stdin(asking.runId, asking.reqId, answer);
    asking = null;
    answer = "";
  }
</script>

<div class="workspace">
  <CodeEditor bind:value={code} {id} {label} errorLine={highlight} onRun={run} />

  <div class="mt-3 flex flex-wrap items-center gap-3">
    <Button variant={check ? "secondary" : "primary"} onclick={run} disabled={status !== "ready" || running}>{t("runner.run")}</Button>
    <Button variant="secondary" onclick={() => client.stop()} disabled={!running}>{t("runner.stop")}</Button>
    {#if check}
      <Button onclick={check.onclick} disabled={status !== "ready" || check.busy} data-testid="check">
        {check.busy ? t("lesson.checking") : check.label}
      </Button>
    {/if}
    <span class="status" role="status" aria-live="polite" data-testid="runner-status" data-status={shownStatus}>
      <span class="dot {shownStatus}" aria-hidden="true"></span>
      {#if status === "loading"}{t("runner.loading")}{:else if status === "failed"}{t("runner.failed", { reason: failReason })}{:else}{t("runner.ready")}{/if}
    </span>
  </div>

  {#if status === "failed"}
    <p class="failed" data-testid="runner-failed">{t("runner.failedHelp")}</p>
  {/if}

  {#if asking}
    <form class="mt-3 flex gap-2" onsubmit={send}>
      <label for="stdin" class="sr-only">{t("runner.inputLabel")}</label>
      <input
        id="stdin"
        bind:this={answerInput}
        bind:value={answer}
        autocomplete="off"
        placeholder={t("runner.inputLabel")}
        class="min-h-11 flex-1 rounded-2xl border-2 border-border bg-code px-3 font-mono text-base text-text sm:text-sm"
      />
      <Button type="submit">{t("runner.send")}</Button>
    </form>
  {/if}

  {#if runExplanation}
    <div role="alert" data-testid="runner-explanation" class="explain">
      <p class="text-sm font-semibold text-danger">
        {t("runner.explanationTitle")}{#if runExplanation.lineno !== null}{" · "}{t("runner.line", { n: runExplanation.lineno })}{/if}
      </p>
      <p class="mt-1 text-text">{runExplanation.text}</p>
    </div>
  {/if}

  <h3 class="out-label">{t("runner.output")}</h3>
  <!-- Empty until something runs: the hint is a CSS pseudo-element, so the text stays "". -->
  <pre data-testid="runner-output" class="out" data-empty={t("runner.outputEmpty")}>{output}</pre>
</div>

<style>
  .workspace {
    padding: var(--space-4);
    border: 2px solid var(--color-border-soft);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  .dot {
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 50%;
    background: var(--color-success);
  }
  .dot.loading,
  .dot.running {
    background: var(--color-warning-strong);
    animation: pulse 1.2s ease-in-out infinite;
  }
  .dot.failed {
    background: var(--color-danger);
  }
  .failed {
    margin: var(--space-3) 0 0;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-danger-soft);
    color: var(--color-text);
  }
  .explain {
    margin-top: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border: 2px solid var(--color-danger);
    border-radius: var(--radius-md);
    background: var(--color-danger-soft);
  }
  .out-label {
    margin: var(--space-4) 0 var(--space-1);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-muted);
  }
  .out {
    min-height: 6rem;
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border: 2px solid var(--color-border-soft);
    border-radius: var(--radius-md);
    background: var(--color-code-bg);
    color: var(--color-text);
    font: 0.9375rem / 1.6 var(--font-mono);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .out:empty::before {
    content: attr(data-empty);
    color: var(--color-text-muted);
    font-family: var(--font-sans);
  }
  @media (prefers-reduced-motion: reduce) {
    .dot {
      animation: none !important;
    }
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }
</style>
