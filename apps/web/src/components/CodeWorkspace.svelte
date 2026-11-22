<script lang="ts">
  // Editor + Run/Stop + input() box + output. Used by the home page Runner and by lesson code
  // steps (which add a Check button). "Run" is always free; "Check" grades in a fresh worker.
  import { catalog, t, type MessageKey } from "@educrs/i18n";
  import { CodeEditor } from "@educrs/ui";
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

  let output = $state("");
  let running = $state(false);
  let asking = $state<{ runId: string; reqId: string } | null>(null);
  let runExplanation = $state<{ text: string; lineno: number | null } | null>(null);
  let answer = $state("");
  let answerInput = $state<HTMLInputElement>();
  let runId: string | null = null;

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
    runExplanation = null;
    running = true;
    runId = client.run(code, {
      stdout: (text) => { output += text; },
      stderr: (text) => { output += text; },
      stdin: (reqId) => {
        if (!runId) return;
        asking = { runId, reqId };
        queueMicrotask(() => answerInput?.focus());
      },
      result: (r) => {
        if (r.status === "error" && r.error) {
          output += r.error;
          runExplanation = words(r.extra);
        }
        if (r.status === "interrupted") output += `\n${t("runner.interrupted")}\n`;
        asking = null;
        running = false;
        runId = null;
      },
    });
  }

  function send(ev: SubmitEvent) {
    ev.preventDefault();
    if (!asking) return;
    output += answer + "\n";
    client.stdin(asking.runId, asking.reqId, answer);
    asking = null;
    answer = "";
  }
</script>

<div class="rounded-lg border border-border bg-surface p-4">
  <CodeEditor bind:value={code} {id} {label} errorLine={highlight} onRun={run} />

  <div class="mt-3 flex flex-wrap items-center gap-3">
    <button
      type="button"
      onclick={run}
      disabled={status !== "ready" || running}
      class="min-h-11 rounded-md border border-accent px-5 font-semibold text-accent disabled:opacity-50"
      class:bg-accent={!check}
      class:text-on-accent={!check}
    >
      {t("runner.run")}
    </button>
    <button
      type="button"
      onclick={() => client.stop()}
      disabled={!running}
      class="min-h-11 rounded-md border border-border px-5 font-semibold text-text disabled:opacity-50"
    >
      {t("runner.stop")}
    </button>
    {#if check}
      <button
        type="button"
        onclick={check.onclick}
        disabled={status !== "ready" || check.busy}
        class="min-h-11 flex-1 rounded-md bg-accent px-6 font-semibold text-on-accent disabled:opacity-50 sm:flex-none"
        data-testid="check"
      >
        {check.busy ? t("lesson.checking") : check.label}
      </button>
    {/if}
    <span class="text-sm text-muted" role="status" aria-live="polite" data-testid="runner-status" data-status={shownStatus}>
      {#if status === "loading"}{t("runner.loading")}{:else if status === "failed"}{t("runner.failed", { reason: failReason })}{:else}{t("runner.ready")}{/if}
    </span>
  </div>

  {#if asking}
    <form class="mt-3 flex gap-2" onsubmit={send}>
      <label for="stdin" class="sr-only">{t("runner.inputLabel")}</label>
      <input
        id="stdin"
        bind:this={answerInput}
        bind:value={answer}
        autocomplete="off"
        placeholder={t("runner.inputLabel")}
        class="min-h-11 flex-1 rounded-md border border-border bg-code px-3 font-mono text-base text-text sm:text-sm"
      />
      <button type="submit" class="min-h-11 rounded-md bg-accent px-4 font-semibold text-on-accent">{t("runner.send")}</button>
    </form>
  {/if}

  {#if runExplanation}
    <div role="alert" data-testid="runner-explanation" class="mt-4 rounded-md border border-danger p-3">
      <p class="text-sm font-semibold text-danger">
        {t("runner.explanationTitle")}{#if runExplanation.lineno !== null}{" · "}{t("runner.line", { n: runExplanation.lineno })}{/if}
      </p>
      <p class="mt-1 text-text">{runExplanation.text}</p>
    </div>
  {/if}

  <h3 class="mt-4 text-sm font-semibold text-muted">{t("runner.output")}</h3>
  <pre data-testid="runner-output" class="mt-1 min-h-24 whitespace-pre-wrap rounded-md border border-border bg-code p-3 font-mono text-sm text-text">{output}</pre>
</div>
