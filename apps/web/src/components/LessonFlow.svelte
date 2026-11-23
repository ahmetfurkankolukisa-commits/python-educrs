<script lang="ts">
  // One lesson, one step at a time (docs/05-f3-mvp0.md §13.3, map §14). The flow logic is the
  // pure reducer in @educrs/core; this component wires it to the sandbox, the store and the UI.
  import { onMount, tick } from "svelte";
  import { catalog, t, type MessageKey } from "@educrs/i18n";
  import { Button, ChoiceList, CodeBlock, FeedbackPanel, GapFill, GoalPicker, HintLadder, LessonComplete, LessonHeader, Markdown } from "@educrs/ui";
  import {
    EVENT, canReveal, checkFeedback, fillFeedback, flow, lessonRun, parseGrade, predictFeedback, resumePoint, revealRatio,
    startFlow, summary, type Exercise, type Explanation, type Feedback, type FlowAction, type FlowState, type Lesson,
    type StepKind, type Tone,
  } from "@educrs/core";
  import type { MascotMood } from "@educrs/ui";
  import { DAILY_GOALS, progressOf, settingsOf } from "@educrs/gamification";
  import CodeWorkspace from "./CodeWorkspace.svelte";
  import SandboxFrame from "./SandboxFrame.svelte";
  import { SandboxClient, type SandboxStatus } from "../lib/sandbox.ts";
  import { nowLocal, openProgress, type Progress } from "../lib/progress.ts";

  interface Props {
    lesson: Lesson;
    exercises: Record<string, Exercise>;
    pathHref: string;
    nextHref: string | null;
  }
  let { lesson, exercises, pathHref, nextHref }: Props = $props();

  const kinds = $derived<StepKind[]>(lesson.steps.map((s) => s.kind));
  const client = new SandboxClient(import.meta.env.PUBLIC_RUN_ORIGIN ?? "");
  let sandbox = $state<SandboxStatus>("loading");
  let failReason = $state("");

  let progress: Progress | null = null;
  let fs = $state<FlowState | null>(null); // null until we know where to resume
  let choice = $state<string | null>(null);
  let code = $state("");
  let checking = $state(false);
  let revealedEl = $state<HTMLElement>();
  /** The last Continue is being stored: a second press must not complete the lesson twice. */
  let finishing = false;
  let pickFirst = $state(false);
  let announce = $state("");
  let heading = $state<HTMLHeadingElement>();
  let stepStarted = 0;

  // End of lesson (docs/05-f3-mvp0.md §15.7): XP this run added, today's goal, streak, plain mode.
  interface Rewards { xp: number; todayXp: number; goal: number; goalReachedNow: boolean; streak: number }
  let rewards = $state<Rewards | null>(null);
  let plainMode = $state(false);
  let askGoal = $state(false);
  let chosenGoal = $state<number | null>(null);
  let goalSaved = $state("");

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
    await progress?.record(type, p);
  }

  async function finish() {
    await record(EVENT.lessonCompleted, { lessonId: lesson.id, contentHash: lesson.contentHash });
    if (!progress) return;
    const all = progress.events();
    const run = new Set(lessonRun(all, lesson.id).map((e) => e.id));
    const now = nowLocal();
    const after = progressOf(all, now);
    const before = progressOf(all.filter((e) => !run.has(e.id)), now);
    plainMode = after.settings.plainMode;
    askGoal = !after.settings.goalChosen && !plainMode;
    // Nothing pre-selected: clicking an already-checked radio fires no change, so a pre-selected
    // 20 could never be confirmed. Until a goal is chosen, the default (20) applies.
    chosenGoal = after.settings.goalChosen ? after.settings.dailyGoal : null;
    rewards = {
      xp: after.xp - before.xp,
      todayXp: after.todayXp,
      goal: after.goal,
      goalReachedNow: before.todayXp < after.goal && after.todayXp >= after.goal,
      streak: after.streak.days,
    };
  }

  async function chooseGoal(goal: number) {
    await record(EVENT.settingsChanged, { dailyGoal: goal });
    if (!progress || !rewards) return;
    const p = progressOf(progress.events(), nowLocal());
    rewards = { ...rewards, todayXp: p.todayXp, goal: p.goal, streak: p.streak.days };
    goalSaved = t("lesson.complete.goalSaved", { n: goal });
  }

  onMount(() => {
    let cancelled = false;
    (async () => {
      const opened = await openProgress();
      if (cancelled) return;
      progress = opened;
      // Known from the start, not only at the end: plain mode also hides Byte on the feedback sheet.
      plainMode = settingsOf(opened.events()).plainMode;
      const at = resumePoint(opened.events(), lesson);
      if (at.start) await record(EVENT.lessonStarted, { lessonId: lesson.id, contentHash: lesson.contentHash });
      const start = startFlow(kinds, at.step);
      if (start.phase === "done") await finish();
      fs = start;
      if (start.phase !== "done") await enterStep(false);
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
    if (fb.tone !== "unavailable") {
      // Saved BEFORE the learner sees the result: leaving right after "Correct!" must not lose the
      // attempt (an IndexedDB write still pending when the page unloads can be dropped; e2e found it).
      checking = true;
      await record(EVENT.attempt, {
        exerciseId: ex.id, contentHash: ex.contentHash, lessonId: lesson.id, step: before.step, difficulty: ex.difficulty,
        correct: fb.tone === "correct", attempt: before.attempts + 1, hints: before.hints, revealRatio: revealRatio(before, units(ex)),
        ...(fb.problem ? { problem: fb.problem } : {}),
        ...(fb.misconceptionId ? { misconceptionId: fb.misconceptionId } : {}),
        ...(fb.seed !== undefined ? { seed: fb.seed } : {}),
        durationMs: Math.round(performance.now() - stepStarted),
      });
      checking = false;
    }
    dispatch({ type: "checked", feedback: fb });
    announce = `${t(TITLES[fb.tone])}. ${plain(fb)}`;
  }

  async function next() {
    if (!fs || finishing) return;
    const after = flow(fs, { type: "continue" });
    if (after === fs) return;
    announce = "";
    if (after.phase === "done") {
      // The completion is stored BEFORE the end screen shows, like an attempt before its feedback
      // (§15.10): its buttons lead away, and someone who leaves the moment they appear must not
      // lose the lesson. It did happen — to a test that left 30 ms after the screen came up (§17.14).
      finishing = true;
      try {
        await finish();
      } finally {
        finishing = false;
      }
      fs = after;
      return;
    }
    fs = after;
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
    if (revealedEl) {
      // Focus tells a screen reader what appeared; centring keeps it clear of the bottom bar.
      revealedEl.focus({ preventScroll: true });
      revealedEl.scrollIntoView({ block: "center" });
    } else {
      heading?.focus();
    }
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

  // What this card asks for, above its title (docs/05-f3-mvp0.md §17.7).
  const KIND: Record<string, MessageKey> = {
    explain: "lesson.kind.explain",
    "predict-output": "lesson.kind.predict",
    "fill-gap": "lesson.kind.fill",
    verbatim: "lesson.kind.verbatim",
    code: "lesson.kind.code",
  };
  const isProject = $derived(lesson.concept.startsWith("proj."));
  const exerciseNumber = (i: number) => kinds.slice(0, i + 1).filter((k) => k === "exercise").length;
  const exerciseCount = $derived(kinds.filter((k) => k === "exercise").length);
  function eyebrow(i: number, type: string): string {
    if (isProject && type !== "explain") return t("lesson.kind.project", { n: exerciseNumber(i), m: exerciseCount });
    return t(KIND[type] ?? "lesson.kind.explain");
  }

  // Byte's face on the feedback sheet (docs/05-f3-mvp0.md §17.11). Never the only signal: the
  // sheet's title, icon and colour already say it.
  const MOODS: Record<Tone, MascotMood> = { correct: "happy", mixup: "thinking", wrong: "oops", unavailable: "thinking" };

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
        <pre class="mt-1 whitespace-pre-wrap rounded-2xl border-2 border-border-soft bg-surface px-3 py-2 font-mono text-base">{fb.compare.expected || t("lesson.compare.nothing")}</pre>
      </figure>
      <figure class="m-0">
        <figcaption class="text-sm font-semibold">{ex?.type === "fill-gap" ? t("lesson.compare.tile") : t("lesson.compare.actual")}</figcaption>
        <pre class="mt-1 whitespace-pre-wrap rounded-2xl border-2 border-border-soft bg-surface px-3 py-2 font-mono text-base">{fb.compare.actual || t("lesson.compare.nothing")}</pre>
      </figure>
    </div>
  {/if}
{/snippet}

<div class="lesson" data-testid="lesson" data-ready={fs !== null} data-phase={fs?.phase ?? "loading"}>
  <LessonHeader done={fs ? (fs.phase === "done" ? kinds.length : fs.step) : 0} total={kinds.length} exitHref={pathHref} />

  {#if !fs}
    <!-- The card's outline while the lesson's progress is read: no layout jump when it arrives. -->
    <div class="skeleton" aria-busy="true">
      <span class="sr-only" role="status">{t("lesson.loading")}</span>
      <span class="sk chip"></span><span class="sk title"></span><span class="sk line"></span><span class="sk line"></span><span class="sk line short"></span><span class="sk block"></span>
    </div>
  {:else if fs.phase === "done"}
    {@const s = summary(fs)}
    <LessonComplete lessonTitle={lesson.title} exercises={s.exercises} firstTry={s.firstTry} {nextHref} {pathHref} {rewards} plain={plainMode}>
      {#if askGoal}
        <div class="goal-card" data-testid="goal-question">
          <h2 class="text-lg font-semibold">{t("lesson.complete.pickGoal")}</h2>
          <p class="text-sm text-muted">{t("lesson.complete.pickGoalHelp")}</p>
          <GoalPicker goals={DAILY_GOALS} bind:selected={chosenGoal} name="daily-goal" legend={t("lesson.complete.pickGoal")} onchange={chooseGoal} />
          <p class="text-sm" role="status" data-testid="goal-saved">{goalSaved}</p>
        </div>
      {/if}
    </LessonComplete>
  {:else if step}
    {#key fs.step}
    <article class="step" data-testid="lesson-step" data-step={fs.step} data-kind={ex?.type ?? "explain"}>
      <div class="heading">
        <p class="eyebrow" data-testid="eyebrow">{eyebrow(fs.step, ex?.type ?? "explain")}</p>
        <h1 class="text-2xl font-bold tracking-tight" tabindex="-1" bind:this={heading}>
          {step.kind === "explain" ? lesson.title : ex?.title}
        </h1>
      </div>

      {#if step.kind === "explain"}
        <Markdown text={step.text} />
        {#if step.example}
          <CodeBlock code={step.example} label={t("lesson.program")} output={step.example_output ?? null} outputLabel={t("lesson.exampleOutput")} />
        {/if}
      {:else if ex}
        <Markdown text={ex.prompt} />

        {#if ex.type === "predict-output"}
          <CodeBlock code={ex.predict.program} label={t("lesson.program")} />
          <ChoiceList options={ex.predict.options} bind:selected={choice} name="answer-{fs.step}" legend={t("lesson.choices")} disabled={fs.phase !== "answering"} highlight={revealedAnswer} result={fs.phase === "feedback" ? (fs.feedback?.tone ?? null) : null} onchange={() => (pickFirst = false)} />
        {:else if ex.type === "fill-gap"}
          <GapFill template={ex.fill.template} tiles={ex.fill.tiles} bind:selected={choice} name="tile-{fs.step}" disabled={fs.phase !== "answering"} highlight={revealedAnswer} result={fs.phase === "feedback" ? (fs.feedback?.tone ?? null) : null} onchange={() => (pickFirst = false)} />
        {:else}
          <!-- "Show me" on a code step: the solution so far, right above the editor it is typed
               into. It used to sit under the output box, below the fold and behind the bottom
               bar, while the page jumped to the top: nothing seemed to happen (§17.14). -->
          {#if revealedCode !== null}
            <div class="revealed" data-testid="revealed-code" tabindex="-1" bind:this={revealedEl}>
              <CodeBlock code={revealedCode} label={t("lesson.reveal.code")} showLabel />
            </div>
          {/if}
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

        {#if fs.phase === "answering"}
          <HintLadder hints={ex.hints} shown={fs.hints} onmore={() => dispatch({ type: "hint", available: ex.hints.length })} />
        {/if}
      {/if}
    </article>
    {/key}

    <!-- One bottom zone (§17.7): Continue / Check / Show me live where the feedback panel opens. -->
    {#if fs.phase === "answering" && (step.kind === "explain" || (ex && (ex.type === "predict-output" || ex.type === "fill-gap" || (canReveal(fs) && fs.revealed < units(ex)))))}
      <div class="action-bar bottom" data-testid="action-bar">
        {#if pickFirst}<p class="pick" role="alert">{t("lesson.pickFirst")}</p>{/if}
        <div class="actions">
          {#if step.kind === "explain"}
            <Button class="grow" onclick={next} data-testid="continue">{t("lesson.continue")}</Button>
          {:else if ex}
            {#if canReveal(fs) && fs.revealed < units(ex)}
              <Button variant="secondary" onclick={reveal} data-testid="show-me">{t("lesson.showMe")}</Button>
            {/if}
            {#if ex.type === "predict-output" || ex.type === "fill-gap"}
              <Button class="grow" onclick={check} data-testid="check">{t("lesson.check")}</Button>
            {/if}
          {/if}
        </div>
      </div>
    {/if}

    {#if fs.phase === "feedback" && fs.feedback}
      {@const fb = fs.feedback}
      <div class="bottom"></div>
      <FeedbackPanel
        tone={fb.tone}
        title={t(TITLES[fb.tone])}
        mascot={plainMode ? null : MOODS[fb.tone]}
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

<style>
  .lesson {
    flex: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 42rem;
    margin: 0 auto;
  }
  /* Phones: on a short card the bottom zone still sits at the bottom of the screen, under the
     thumb. Wide screens: it follows the card instead — a button far below the text looks lost. */
  .bottom {
    margin-top: auto;
  }
  @media (min-width: 720px) {
    .lesson {
      flex: none;
    }
    .action-bar.bottom {
      margin-top: var(--space-2);
      border-top: 0;
    }
  }
  .revealed:focus {
    outline: none;
  }
  .step {
    display: grid;
    /* minmax(0, 1fr), not auto: the symbol bar's long row must scroll inside its box instead of
       widening the card past the screen (found on a 390 px phone, §17.9) */
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-5, 1.25rem);
    margin: var(--space-6) 0;
    animation: step-in var(--motion-base) var(--ease-out);
  }
  .heading {
    display: grid;
    gap: var(--space-1);
  }
  .eyebrow {
    justify-self: start;
    margin: 0;
    padding: 0.125rem var(--space-3);
    border-radius: 999px;
    background: var(--color-accent-soft);
    color: var(--color-accent);
    font-size: var(--text-sm);
    font-weight: 700;
  }
  /* The bottom zone: same place as the feedback panel, clear of the iPhone home indicator. */
  .action-bar {
    position: sticky;
    bottom: 0;
    z-index: 1;
    display: grid;
    gap: var(--space-2);
    /* auto on top: on a short card the bar still sits at the bottom of the screen */
    margin: auto calc(-1 * var(--space-4)) 0;
    padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom));
    border-top: 2px solid var(--color-border-soft);
    background: var(--color-bg);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }
  .actions :global(.grow) {
    flex: 1 1 12rem;
  }
  .pick {
    margin: 0;
    color: var(--color-danger);
    font-weight: 600;
  }
  .goal-card {
    display: grid;
    gap: var(--space-2);
    width: 100%;
    max-width: 36rem;
    margin-top: var(--space-4);
    padding: var(--space-4);
    border: 2px solid var(--color-border-soft);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    text-align: left;
  }
  .goal-card h2 {
    margin: 0;
    font-size: var(--text-lg);
  }
  .skeleton {
    display: grid;
    gap: var(--space-3);
    margin-top: var(--space-8);
  }
  .sk {
    display: block;
    height: 1rem;
    border-radius: var(--radius-sm);
    background: var(--color-border-soft);
    animation: shimmer 1.4s ease-in-out infinite;
  }
  .sk.chip {
    width: 7rem;
    height: 1.5rem;
    border-radius: 999px;
  }
  .sk.title {
    width: 70%;
    height: 2rem;
  }
  .sk.short {
    width: 55%;
  }
  .sk.block {
    height: 7rem;
    border-radius: var(--radius-md);
  }
  @media (prefers-reduced-motion: reduce) {
    .sk {
      animation: none;
    }
  }
  @keyframes step-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
  }
  @keyframes shimmer {
    50% {
      opacity: 0.55;
    }
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
</style>
