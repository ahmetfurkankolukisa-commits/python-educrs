<script lang="ts">
  // Talks to the sandbox site (different site, plan §3.1). Trusts nothing it receives:
  // checks origin + source, accepts only known message types, renders output as text.
  import { t } from "@educrs/i18n";

  // Inlined at build time; the build fails if it is missing (scripts/write-headers.mjs).
  const RUN_ORIGIN = import.meta.env.PUBLIC_RUN_ORIGIN ?? "";

  type Status = "loading" | "ready" | "running" | "failed";
  let code = $state('name = input("What is your name? ")\nprint("Hello,", name)');
  let output = $state("");
  let status = $state<Status>("loading");
  let failReason = $state("");
  let asking = $state<{ runId: string; reqId: string } | null>(null);
  let answer = $state("");
  let frame = $state<HTMLIFrameElement>();
  let answerInput = $state<HTMLInputElement>();
  let seq = 0;
  let currentRun: string | null = null;
  let acked = false; // sandbox accepted our hello (protocol v1, docs/05-f3-mvp0.md §6)
  const PROTOCOL = 1;
  const HELLO_INTERVAL_MS = 250;
  const HELLO_MAX_TRIES = 80; // ~20 s: the sandbox page itself may still be loading

  const isStr = (v: unknown): v is string => typeof v === "string";

  function onMessage(e: MessageEvent) {
    if (e.origin !== RUN_ORIGIN || !frame || e.source !== frame.contentWindow) return;
    const m = e.data as Record<string, unknown> | null;
    if (!m || typeof m !== "object" || !isStr(m.type)) return;
    if (m.type === "hello-ack") {
      acked = m.protocol === PROTOCOL;
      return;
    }
    if (m.type === "ready") {
      const caps = (m.caps ?? {}) as Record<string, unknown>;
      if (isStr(caps.fatal)) {
        status = "failed";
        failReason = caps.fatal.split("\n")[0] ?? "";
      } else {
        status = "ready";
      }
      return;
    }
    if (m.runId !== currentRun) return;
    if ((m.type === "stdout" || m.type === "stderr") && isStr(m.text)) {
      output += m.text;
    } else if (m.type === "stdin_request" && isStr(m.reqId)) {
      asking = { runId: m.runId as string, reqId: m.reqId };
      queueMicrotask(() => answerInput?.focus());
    } else if (m.type === "result") {
      if (m.status === "error" && isStr(m.error)) output += m.error;
      if (m.status === "interrupted") output += `\n${t("runner.interrupted")}\n`;
      asking = null;
      currentRun = null;
      status = "ready";
    }
  }

  $effect(() => {
    window.addEventListener("message", onMessage);
    // The sandbox only talks to an origin it has verified, so we introduce ourselves until it answers.
    let tries = 0;
    const timer = setInterval(() => {
      if (acked) { clearInterval(timer); return; }
      if (tries++ >= HELLO_MAX_TRIES) {
        clearInterval(timer);
        if (status === "loading") { status = "failed"; failReason = "the Python sandbox did not answer"; }
        return;
      }
      frame?.contentWindow?.postMessage({ type: "hello", protocol: PROTOCOL }, RUN_ORIGIN);
    }, HELLO_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      window.removeEventListener("message", onMessage);
    };
  });

  function run() {
    if (status !== "ready" || !frame?.contentWindow) return;
    currentRun = `r${++seq}`;
    output = "";
    status = "running";
    frame.contentWindow.postMessage({ type: "run", runId: currentRun, code, mode: "run" }, RUN_ORIGIN);
  }

  function stop() {
    frame?.contentWindow?.postMessage({ type: "stop" }, RUN_ORIGIN);
  }

  function send(ev: SubmitEvent) {
    ev.preventDefault();
    if (!asking || !frame?.contentWindow) return;
    output += answer + "\n";
    frame.contentWindow.postMessage({ type: "stdin", runId: asking.runId, reqId: asking.reqId, value: answer }, RUN_ORIGIN);
    asking = null;
    answer = "";
  }

  function onKeydown(ev: KeyboardEvent) {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === "Enter") {
      ev.preventDefault();
      run();
    }
  }
</script>

<div class="rounded-lg border border-border bg-surface p-4">
  <!-- Form fields stay at 16px on small screens: iOS Safari zooms the page into smaller fields on focus. -->
  <label for="code" class="sr-only">Python code</label>
  <textarea
    id="code"
    bind:value={code}
    onkeydown={onKeydown}
    rows="6"
    spellcheck="false"
    autocapitalize="off"
    autocomplete="off"
    class="w-full resize-y rounded-md border border-border bg-code p-3 font-mono text-base text-text sm:text-sm"
  ></textarea>

  <div class="mt-3 flex flex-wrap items-center gap-3">
    <button
      type="button"
      onclick={run}
      disabled={status !== "ready"}
      class="min-h-11 rounded-md bg-accent px-5 font-semibold text-on-accent disabled:opacity-50"
    >
      {t("runner.run")}
    </button>
    <button
      type="button"
      onclick={stop}
      disabled={status !== "running"}
      class="min-h-11 rounded-md border border-accent px-5 font-semibold text-accent disabled:opacity-50"
    >
      {t("runner.stop")}
    </button>
    <span class="text-sm text-muted" role="status" aria-live="polite" data-testid="runner-status" data-status={status}>
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

  <h3 class="mt-4 text-sm font-semibold text-muted">{t("runner.output")}</h3>
  <pre data-testid="runner-output" class="mt-1 min-h-24 whitespace-pre-wrap rounded-md border border-border bg-code p-3 font-mono text-sm text-text">{output}</pre>

  <iframe
    bind:this={frame}
    title="Python sandbox"
    src={`${RUN_ORIGIN}/index.html`}
    sandbox="allow-scripts allow-same-origin"
    hidden
  ></iframe>
</div>
