<script lang="ts">
  // One lesson, one step at a time (docs/05-f3-mvp0.md §13.3, map §14). The flow logic is the
  // pure reducer in @educrs/core; this component wires it to the sandbox, the store and the UI.
  import { onMount, tick } from "svelte";
  import { catalog, t, type MessageKey } from "@educrs/i18n";
  import { ChoiceList, CodeBlock, FeedbackPanel, GapFill, HintLadder, LessonComplete, LessonHeader, Markdown } from "@educrs/ui";
  import {
    EVENT, canReveal, checkFeedback, fillFeedback, flow, monotonic, newEvent, parseGrade, predictFeedback, resumePoint, revealRatio,
    startFlow, summary, type EventContext, type Exercise, type Explanation, type Feedback, type FlowAction, type FlowState, type Lesson,
    type LocalStore, type StepKind, type Tone,
  } from "@educrs/core";
  import { openLocalStore } from "@educrs/store";
  import CodeWorkspace from "./CodeWorkspace.svelte";
  import SandboxFrame from "./SandboxFrame.svelte";
  import { SandboxClient, type SandboxStatus } from "../lib/sandbox.ts";

  interface Props {
    lesson: Lesson;
    exercises: Record<string, Exercise>;
    pathHref: string;
    nextHref: string | null;
  }
  let { lesson, exercises, pathHref, nextHref }: Props = $props();

  const kinds: StepKind[] = lesson.steps.map((s) => s.kind);
  const client = new SandboxClient(import.meta.env.PUBLIC_RUN_ORIGIN ?? "");
  let sandbox = $state<SandboxStatus>("loading");
  let failReason = $state("");

  let store: LocalStore | null = null;
  let ctx: EventContext | null = null;
  let fs = $state<FlowState | null>(null); // null until we know where to resume
  let choice = $state<string | null>(null);
  let code = $state("");
  let checking = $state(false);
  let pickFirst = $state(false);
  let announce = $state("");
  let heading = $state<HTMLHeadingElement>();
  let stepStarted = 0;

  const step = $derived(fs ? lesson.steps[fs.step] : undefined);
  const ex = $derived(step?.kind === "exercise" ? exercises[step.id] : undefined);
  const units = (e: Exercise): number =>
    e.type === "code" ? lines(e.solution).length : e.type === "verbatim" ? lines(e.check.target).length : 1;
  const lines = (s: string) => s.replace(/\n+$/, "").split("\n");
  const revealedAnswer = $derived(fs && ex && fs.revealed > 0 ? (ex.type === "predict-output" ? ex.predict.answer : ex.type === "fill-gap" ? ex.fill.answer : null) : null);
  const revealedCode = $derived(fs && ex && fs.revealed > 0 && (ex.type === "code" || ex.type === "verbatim")
    ? lines(ex.type === "code" ? ex.solution : ex.check.target).slice(0, fs.revealed).join("\n")
    : null);

  async function record(type: string, p: Record<string, unknown>) {
    if (!store || !ctx) return;
    try {
      await store.append([newEvent(ctx, type, p)]);
    } catch {
      // Storage failing must never stop the lesson; progress is just not saved.
    }
  }

  onMount(() => {
    let cancelled = false;
    (async () => {
      const opened = await openLocalStore();
      if (cancelled) return;
      store = opened.store;
      ctx = {
        now: monotonic(() => Date.now()),
        tz: () => -new Date().getTimezoneOffset(),
        dev: await store.deviceId(),
        random: () => crypto.getRandomValues(new Uint8Array(10)),
      };
      const at = resumePoint(await store.all(), lesson);
      if (cancelled) return;
      if (at.start) await record(EVENT.lessonStarted, { lessonId: lesson.id, contentHash: lesson.contentHash });
      fs = startFlow(kinds, at.step);
      if (fs.phase === "done") await record(EVENT.lessonCompleted, { lessonId: lesson.id, contentHash: lesson.contentHash });
      else await enterStep(false);
    })();
    return () => { cancelled = true; };
  });

  async function enterStep(focus = true) {
    choice = null;
    pickFirst = false;
    const e = step?.kind === "exercise" ? exercises[step.id] : undefined;
    code = e && (e.type === "code" || e.type === "verbatim") ? e.starter : "";
    stepStarted = performance.now();
    if (focus) {
      await tick();
      heading?.focus();
    }
  }

  function dispatch(a: FlowAction) {
    if (fs) fs = flow(fs, a);
  }

  async function check() {
    if (!fs || fs.phase !== "answering" || !ex || checking) return;
    let fb: Feedback;
    if (ex.type === "predict-output" || ex.type === "fill-gap") {
      if (choice === null) { pickFirst = true; return; }
      fb = ex.type === "predict-output" ? predictFeedback(ex, choice) : fillFeedback(ex, choice);
    } else {
      if (sandbox !== "ready") return;
      checking = true;
      const seed = (crypto.getRandomValues(new Uint32Array(1))[0] as number) >>> 1;
      fb = checkFeedback(ex, parseGrade(await client.check(code, ex, seed)));
      checking = false;
    }
    const before = fs;
    if (!before || before.phase !== "answering") return;
    dispatch({ type: "checked", feedback: fb });
    announce = `${t(TITLES[fb.tone])}. ${plain(fb)}`;
    if (fb.tone === "unavailable") return;
    void record(EVENT.attempt, {
      exerciseId: ex.id, contentHash: ex.contentHash, lessonId: lesson.id, step: before.step,
      correct: fb.tone === "correct", attempt: before.attempts + 1, hints: before.hints, revealRatio: revealRatio(before, units(ex)),
      ...(fb.problem ? { problem: fb.problem } : {}),
      ...(fb.misconceptionId ? { misconceptionId: fb.misconceptionId } : {}),
      ...(fb.seed !== undefined ? { seed: fb.seed } : {}),
      durationMs: Math.round(performance.now() - stepStarted),
    });
  }

  async function next() {
    if (!fs) return;
    const before = fs;
    dispatch({ type: "continue" });
    if (fs === before) return;
    announce = "";
    if (fs.phase === "done") {
      await record(EVENT.lessonCompleted, { lessonId: lesson.id, contentHash: lesson.contentHash });
      return;
    }
    await enterStep();
  }

  async function retry() {
    dispatch({ type: "retry" });
    announce = "";
    await tick();
    heading?.focus();
  }

  async function reveal() {
    if (!ex) return;
    dispatch({ type: "reveal", units: units(ex) });
    if (revealedAnswer !== null) choice = revealedAnswer;
    await tick();
    heading?.focus();
  }

  /** Enter = Check / Continue (§13.3) when focus is not somewhere Enter already means something. */
  function onKey(e: KeyboardEvent) {
    if (e.key !== "Enter" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || !fs || fs.phase !== "answering") return;
    const el = e.target as HTMLElement | null;
    const tag = el?.tagName;
    if (el?.isContentEditable || tag === "TEXTAREA" || tag === "BUTTON" || tag === "A" || (tag === "INPUT" && (el as HTMLInputElement).type !== "radio")) return;
    if (step?.kind === "explain") { e.preventDefault(); void next(); }
    else if (ex && (ex.type === "predict-output" || ex.type === "fill-gap")) { e.preventDefault(); void check(); }
  }

  const TITLES: Record<Tone, MessageKey> = {
    correct: "lesson.feedback.correct",
    mixup: "lesson.feedback.mixup",
    wrong: "lesson.feedback.wrong",
    unavailable: "lesson.feedback.unavailable",
  };

  function explainText(e: Explanation): string {
    const key = `explain.${e.id}`;
    return key in catalog("en") ? t(key as MessageKey, e.params) : t("lesson.generic.wrong");
  }
  const messageText = (m: NonNullable<Feedback["message"]>) => t(m.key as MessageKey, m.params);
  function plain(fb: Feedback): string {
    return [fb.text?.replace(/[`*]/g, ""), fb.message ? messageText(fb.message) : "", fb.explanation ? explainText(fb.explanation) : ""].filter(Boolean).join(" ");
  }
  const inputsText = (inputs: Readonly<Record<string, unknown>>) =>
    Object.entries(inputs).map(([k, v]) => `${k} = ${JSON.stringify(v)}`).join(", ");
</script>

<svelte:window onkeydown={onKey} />

{#snippet feedbackBody(fb: Feedback)}
  {#if fb.text}<Markdown text={fb.text} />{/if}
  {#if fb.message}<p>{messageText(fb.message)}</p>{/if}
  {#if fb.explanation}<p data-testid="feedback-explanation">{explainText(fb.explanation)}</p>{/if}
  {#if fb.compare}
    {#if fb.compare.inputs && Object.keys(fb.compare.inputs).length}
      <p class="text-sm text-muted">{t("lesson.compare.when", { inputs: inputsText(fb.compare.inputs) })}</p>
    {/if}
    <div class="grid gap-3 sm:grid-cols-2" data-testid="feedback-compare">
      <figure class="m-0">
        <figcaption class="text-sm font-semibold">{t("lesson.compare.expected")}</figcaption>
        <pre class="mt-1 whitespace-pre-wrap rounded-md border border-border bg-surface p-2 font-mono text-base">{fb.compare.expected || t("lesson.compare.nothing")}</pre>
      </figure>
      <figure class="m-0">
        <figcaption class="text-sm font-semibold">{ex?.type === "fill-gap" ? t("lesson.compare.tile") : t("lesson.compare.actual")}</figcaption>
        <pre class="mt-1 whitespace-pre-wrap rounded-md border border-border bg-surface p-2 font-mono text-base">{fb.compare.actual || t("lesson.compare.nothing")}</pre>
      </figure>
    </div>
  {/if}
{/snippet}

<div class="lesson" data-testid="lesson" data-ready={fs !== null} data-phase={fs?.phase ?? "loading"}>
  <LessonHeader done={fs ? (fs.phase === "done" ? kinds.length : fs.step) : 0} total={kinds.length} exitHref={pathHref} />

  {#if !fs}
    <p class="mt-8 text-muted">{t("lesson.loading")}</p>
  {:else if fs.phase === "done"}
    {@const s = summary(fs)}
    <LessonComplete lessonTitle={lesson.title} exercises={s.exercises} firstTry={s.firstTry} {nextHref} {pathHref} />
  {:else if step}
    <article class="mt-6 grid gap-5" data-testid="lesson-step" data-step={fs.step} data-kind={ex?.type ?? "explain"}>
      <h1 class="text-2xl font-bold tracking-tight" tabindex="-1" bind:this={heading}>
        {step.kind === "explain" ? lesson.title : ex?.title}
      </h1>

      {#if step.kind === "explain"}
        <Markdown text={step.text} />
        {#if step.example}
          <CodeBlock code={step.example} label={t("lesson.program")} output={step.example_output ?? null} outputLabel={t("lesson.exampleOutput")} />
        {/if}
        <button type="button" class="min-h-11 rounded-md bg-accent px-6 font-semibold text-on-accent" onclick={next} data-testid="continue">
          {t("lesson.continue")}
        </button>
      {:else if ex}
        <Markdown text={ex.prompt} />

        {#if ex.type === "predict-output"}
          <CodeBlock code={ex.predict.program} label={t("lesson.program")} />
          <ChoiceList options={ex.predict.options} bind:selected={choice} name="answer-{fs.step}" legend={t("lesson.choices")} disabled={fs.phase !== "answering"} highlight={revealedAnswer} onchange={() => (pickFirst = false)} />
        {:else if ex.type === "fill-gap"}
          <GapFill template={ex.fill.template} tiles={ex.fill.tiles} bind:selected={choice} name="tile-{fs.step}" disabled={fs.phase !== "answering"} highlight={revealedAnswer} onchange={() => (pickFirst = false)} />
        {:else}
          {#key fs.step}
            <CodeWorkspace
              {client}
              status={sandbox}
              {failReason}
              bind:code
              id="code-{fs.step}"
              label={t("lesson.program")}
              errorLine={fs.phase === "feedback" ? (fs.feedback?.errorLine ?? null) : null}
              check={fs.phase === "answering" ? { label: t("lesson.check"), onclick: check, busy: checking } : null}
            />
          {/key}
        {/if}

        {#if revealedCode !== null}
          <div data-testid="revealed-code">
            <CodeBlock code={revealedCode} label={t("lesson.reveal.code")} />
          </div>
        {/if}

        {#if fs.phase === "answering"}
          <div class="flex flex-wrap items-start gap-3">
            <div class="flex-1">
              <HintLadder hints={ex.hints} shown={fs.hints} onmore={() => dispatch({ type: "hint", available: ex.hints.length })} />
            </div>
            {#if canReveal(fs) && fs.revealed < units(ex)}
              <button type="button" class="min-h-11 rounded-md border-2 border-border px-4 font-semibold" onclick={reveal} data-testid="show-me">{t("lesson.showMe")}</button>
            {/if}
            {#if ex.type === "predict-output" || ex.type === "fill-gap"}
              <button type="button" class="min-h-11 rounded-md bg-accent px-8 font-semibold text-on-accent" onclick={check} data-testid="check">{t("lesson.check")}</button>
            {/if}
          </div>
          {#if pickFirst}<p class="text-danger" role="alert">{t("lesson.pickFirst")}</p>{/if}
        {/if}
      {/if}
    </article>

    {#if fs.phase === "feedback" && fs.feedback}
      {@const fb = fs.feedback}
      <FeedbackPanel
        tone={fb.tone}
        title={t(TITLES[fb.tone])}
        primary={fb.tone === "correct" ? { label: t("lesson.continue"), onclick: next } : { label: t("lesson.tryAgain"), onclick: retry }}
        secondary={fb.tone !== "correct" && canReveal(fs) && ex && fs.revealed < units(ex) ? { label: t("lesson.showMe"), onclick: reveal } : null}
      >
        {@render feedbackBody(fb)}
      </FeedbackPanel>
    {/if}
  {/if}

  <div class="sr-only" aria-live="polite" data-testid="announce">{announce}</div>
</div>

<SandboxFrame {client} onstatus={(s, reason) => { sandbox = s; failReason = reason ?? ""; }} />
