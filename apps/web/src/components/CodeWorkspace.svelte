<script lang="ts">
  // Editor + Run/Stop + input() box + output. Used by the home page Runner and by lesson code
  // steps (which add a Check button). "Run" is always free; "Check" grades in a fresh worker.
  import { onDestroy, tick } from "svelte";
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

  // Full-screen mode (docs/05-f3-mvp0.md §17.15): the same workspace grows over the window, so the
  // code, the cursor and the undo history stay. Not the browser's Fullscreen API — an iPhone cannot
  // put an element full screen. While it is open the rest of the page is inert, like under a dialog.
  let expanded = $state(false);
  let workspace = $state<HTMLDivElement>();
  let editor = $state<{ focus(): void }>();
  let expandButton = $state<HTMLButtonElement>();
  let restore: (() => void) | null = null;
  const titleId = $derived(`${id}-fullscreen`);

  /** Make everything outside `el` inert, and stop the page behind from scrolling. Returns the undo. */
  function isolate(el: HTMLElement) {
    const made: HTMLElement[] = [];
    for (let node: HTMLElement | null = el; node && node !== document.body; node = node.parentElement) {
      for (const other of node.parentElement?.children ?? []) {
        if (other !== node && other instanceof HTMLElement && !other.inert) {
          other.inert = true;
          made.push(other);
        }
      }
    }
    const page = document.documentElement;
    const overflow = page.style.overflow;
    page.style.overflow = "hidden";
    return () => {
      for (const other of made) other.inert = false;
      page.style.overflow = overflow;
    };
  }

  async function setExpanded(on: boolean) {
    if (on === expanded || !workspace) return;
    expanded = on;
    if (on) {
      restore = isolate(workspace);
      await tick();
      editor?.focus();
    } else {
      restore?.();
      restore = null;
      await tick();
      expandButton?.focus();
    }
  }
  onDestroy(() => restore?.());

  function onKey(e: KeyboardEvent) {
    // Esc leaves the mode. Not when the editor used the key itself (it then marks it handled).
    if (expanded && e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      void setExpanded(false);
    }
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

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="workspace"
  class:expanded
  bind:this={workspace}
  role={expanded ? "dialog" : undefined}
  aria-modal={expanded ? "true" : undefined}
  aria-labelledby={expanded ? titleId : undefined}
  data-testid="workspace"
  data-expanded={expanded}
  onkeydown={onKey}
>
  {#if expanded}
    <div class="bar">
      <h2 id={titleId} class="bar-title">{t("runner.fullScreenTitle")}</h2>
      <Button variant="secondary" onclick={() => setExpanded(false)} data-testid="exit-full-screen">{t("runner.exitFullScreen")}</Button>
    </div>
  {/if}
  <div class="edit">
    <CodeEditor bind:this={editor} bind:value={code} {id} {label} errorLine={highlight} onRun={run} fill={expanded} />
  </div>

  <div class="side">
  <div class="controls flex flex-wrap items-center gap-3">
    <Button variant={check ? "secondary" : "primary"} onclick={run} disabled={status !== "ready" || running}>{t("runner.run")}</Button>
    <Button variant="secondary" onclick={() => client.stop()} disabled={!running}>{t("runner.stop")}</Button>
    {#if check}
      <!-- The result is shown in the lesson, so Check leaves full-screen mode first. -->
      <Button onclick={() => { void setExpanded(false); check.onclick(); }} disabled={status !== "ready" || check.busy} data-testid="check">
        {check.busy ? t("lesson.checking") : check.label}
      </Button>
    {/if}
    <span class="status" role="status" aria-live="polite" data-testid="runner-status" data-status={shownStatus}>
      <span class="dot {shownStatus}" aria-hidden="true"></span>
      {#if status === "loading"}{t("runner.loading")}{:else if status === "failed"}{t("runner.failed", { reason: failReason })}{:else}{t("runner.ready")}{/if}
    </span>
    {#if !expanded}
      <button type="button" class="expand" bind:this={expandButton} onclick={() => setExpanded(true)} aria-label={t("runner.fullScreen")} title={t("runner.fullScreen")} data-testid="full-screen">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
        <span class="expand-text">{t("runner.fullScreen")}</span>
      </button>
    {/if}
  </div>

  {#if status === "failed"}
    <p class="failed-help" data-testid="runner-failed">{t("runner.failedHelp")}</p>
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
</div>

<style>
  .workspace {
    padding: var(--space-4);
    border: 2px solid var(--color-border-soft);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }
  .controls {
    margin-top: var(--space-3);
  }
  /* A quiet button at the end of the row: an icon everywhere, with its words where there is room. */
  .expand {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-width: var(--target-min);
    min-height: var(--target-min);
    margin-left: auto;
    padding: 0 var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--color-text-muted);
    font: 600 var(--text-sm) / 1 var(--font-sans);
    cursor: pointer;
  }
  .expand:hover {
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }
  .expand:focus-visible {
    outline: 3px solid var(--color-focus);
    outline-offset: 2px;
  }
  .expand svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .expand-text {
    display: none;
  }
  @media (min-width: 640px) {
    .expand-text {
      display: inline;
    }
  }

  /* Full-screen mode: the workspace over the whole window. One column on a phone (the editor
     takes the height that is left and scrolls inside); from 900 px the output sits beside it. */
  .workspace.expanded {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: var(--space-3);
    box-sizing: border-box;
    height: 100dvh;
    padding: max(var(--space-3), env(safe-area-inset-top)) max(var(--space-4), env(safe-area-inset-right))
      max(var(--space-3), env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left));
    border: 0;
    border-radius: 0;
    background: var(--color-bg);
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
  }
  .bar-title {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 700;
  }
  .expanded .edit {
    min-height: 0;
  }
  .expanded .side {
    min-height: 0;
    max-height: 42dvh;
    overflow: auto;
  }
  .expanded .controls {
    margin-top: 0;
  }
  @media (min-width: 900px) {
    .workspace.expanded {
      grid-template-columns: minmax(0, 3fr) minmax(18rem, 2fr);
      grid-template-rows: auto minmax(0, 1fr);
      column-gap: var(--space-6);
    }
    .expanded .bar {
      grid-column: 1 / -1;
    }
    .expanded .side {
      max-height: none;
    }
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  .dot {
    flex: 0 0 auto;
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
  /* Not `.failed`: the status dot carries the status as a class too (`dot failed`), and a shared
     name gave the dot this card's padding — a red blob instead of a dot (§17.14). */
  .failed-help {
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
