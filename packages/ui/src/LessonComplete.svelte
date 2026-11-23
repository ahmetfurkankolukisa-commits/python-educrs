<script lang="ts">
  // End-of-lesson screen (docs/05-f3-mvp0.md §13.5, §15.7). "Right on the first try" is shown
  // here only and never affects XP (no penalty for wrong answers). Plain mode shows the plain
  // facts: no badge, no numbers, no celebration (plan §3.5.1 #4).
  import { onMount, type Snippet } from "svelte";
  import { t } from "@educrs/i18n";
  import Button from "./Button.svelte";
  import GoalRing from "./GoalRing.svelte";
  import Mascot from "./Mascot.svelte";

  interface Rewards {
    /** XP this lesson added. */
    xp: number;
    todayXp: number;
    goal: number;
    /** This lesson is what reached today's goal (celebrate once). */
    goalReachedNow: boolean;
    streak: number;
  }

  interface Props {
    lessonTitle: string;
    exercises: number;
    firstTry: number;
    nextHref?: string | null;
    pathHref: string;
    /** null while the numbers are being worked out, or when there are none to show. */
    rewards?: Rewards | null;
    plain?: boolean;
    /** Extra content above the buttons (e.g. the daily goal question). */
    children?: Snippet;
  }
  let { lessonTitle, exercises, firstTry, nextHref = null, pathHref, rewards = null, plain = false, children }: Props = $props();
  let heading = $state<HTMLHeadingElement>();
  onMount(() => heading?.focus());
  const met = $derived(!!rewards && rewards.todayXp >= rewards.goal);

  // "+55 XP" counts up from 0 (a reward moment, §17.11). Screen readers get the final number once;
  // with reduced motion there is no counting.
  let shownXp = $state(0);
  $effect(() => {
    const target = rewards?.xp ?? 0;
    if (target <= 0 || typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      shownXp = target;
      return;
    }
    const started = performance.now();
    const duration = 800;
    let frame = requestAnimationFrame(function tick(now) {
      const k = Math.min(1, (now - started) / duration);
      shownXp = Math.round(target * (1 - (1 - k) ** 3)); // ease-out
      if (k < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  });
</script>

<section class="done" data-testid="lesson-complete" data-plain={plain}>
  {#if !plain}
    <div class="badge-wrap" aria-hidden="true">
      <div class="badge"><Mascot mood="celebrate" size={128} /></div>
      <!-- A small burst of sparks: CSS only, never in plain mode or with reduced motion (§17.6). -->
      <span class="sparks">{#each [0, 1, 2, 3, 4, 5, 6, 7] as i (i)}<i></i>{/each}</span>
    </div>
  {/if}
  <h1 tabindex="-1" bind:this={heading}>{t("lesson.complete.title")}</h1>
  <p class="lesson">{lessonTitle}</p>
  {#if !plain}
    <p class="stat">{t("lesson.complete.firstTry", { n: firstTry, m: exercises })}</p>
    {#if rewards}
      <ul class="rewards" data-testid="rewards">
        <li class="xp" data-xp={rewards.xp}>
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M13.5 2 4.5 13.5h6.2L9.8 22l9.4-12.2h-6.4z" /></svg>
          <span class="count" aria-hidden="true" data-testid="reward-xp">{t("lesson.complete.xp", { n: shownXp })}</span>
          <span class="sr-only">{t("lesson.complete.xp", { n: rewards.xp })}</span>
        </li>
        <li class="goal" class:celebrate={rewards.goalReachedNow} data-testid="reward-goal" data-met={met}>
          <GoalRing value={rewards.todayXp} goal={rewards.goal} label={t("stats.goal.label")} valueText={t("stats.goal.value", { n: rewards.todayXp, m: rewards.goal })} />
          <span>{met ? t("lesson.complete.goalReached") : t("stats.goal.value", { n: rewards.todayXp, m: rewards.goal })}</span>
        </li>
        {#if rewards.streak > 0}
          <li class="streak" data-testid="reward-streak" data-days={rewards.streak}>
            <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 2.5c.6 3.2 4.8 5.4 4.8 10.3a4.8 4.8 0 0 1-9.6 0c0-2.3 1.2-3.9 2.4-5 .1 1.6.8 2.7 1.8 3.3-.4-3 .1-5.9.6-8.6z" />
            </svg>
            {t("lesson.complete.streak", { n: rewards.streak })}
          </li>
        {/if}
      </ul>
    {/if}
  {/if}
  {@render children?.()}
  <div class="actions">
    {#if nextHref}<Button href={nextHref} wide>{t("lesson.complete.next")}</Button>{/if}
    <Button href={pathHref} variant={nextHref ? "secondary" : "primary"} wide>{t("lesson.complete.path")}</Button>
  </div>
</section>

<style>
  .done {
    display: grid;
    justify-items: center;
    gap: var(--space-3);
    padding: var(--space-8) var(--space-4);
    text-align: center;
  }
  .badge-wrap {
    position: relative;
    width: 8rem;
    height: 8rem;
  }
  .badge {
    animation: pop var(--motion-base) var(--ease-out);
  }
  .sparks i {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0.5rem;
    height: 0.5rem;
    margin: -0.25rem;
    border-radius: 50%;
    background: var(--color-accent);
    opacity: 0;
    animation: spark 700ms var(--ease-out) 120ms;
  }
  .sparks i:nth-child(odd) {
    background: var(--color-streak-fill);
  }
  .sparks i:nth-child(1) { --dx: 0rem; --dy: -4.5rem; }
  .sparks i:nth-child(2) { --dx: 3.2rem; --dy: -3.2rem; }
  .sparks i:nth-child(3) { --dx: 4.5rem; --dy: 0rem; }
  .sparks i:nth-child(4) { --dx: 3.2rem; --dy: 3.2rem; }
  .sparks i:nth-child(5) { --dx: 0rem; --dy: 4.5rem; }
  .sparks i:nth-child(6) { --dx: -3.2rem; --dy: 3.2rem; }
  .sparks i:nth-child(7) { --dx: -4.5rem; --dy: 0rem; }
  .sparks i:nth-child(8) { --dx: -3.2rem; --dy: -3.2rem; }
  @media (prefers-reduced-motion: reduce) {
    .sparks {
      display: none;
    }
  }
  h1 {
    margin: 0;
    /* stated, not left to the browser: the app's reset makes headings inherit their weight */
    font-size: var(--text-3xl);
    font-weight: 700;
    letter-spacing: -0.025em;
  }
  h1:focus {
    outline: none;
  }
  .lesson {
    margin: 0;
    color: var(--color-text-muted);
  }
  .stat {
    margin: 0;
    font-size: var(--text-lg);
  }
  .rewards {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-3);
    margin: var(--space-2) 0 0;
    padding: 0;
    list-style: none;
  }
  .rewards li {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 2.75rem;
    padding: var(--space-1) var(--space-4);
    border-radius: 999px;
    font-weight: 700;
  }
  .icon {
    width: 1.25rem;
    height: 1.25rem;
  }
  .xp {
    background: var(--color-xp-soft);
    color: var(--color-xp);
  }
  .count {
    font-variant-numeric: tabular-nums;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
  .xp .icon {
    fill: var(--color-xp);
  }
  .goal {
    background: var(--color-success-soft);
    color: var(--color-success);
  }
  .streak {
    background: var(--color-streak-soft);
    color: var(--color-streak);
  }
  .streak .icon {
    fill: var(--color-streak-fill);
  }
  .goal.celebrate {
    animation: pop var(--motion-base) var(--ease-out);
  }
  .actions {
    display: grid;
    gap: var(--space-2);
    width: min(100%, 22rem);
    margin-top: var(--space-6);
  }
  @keyframes pop {
    from {
      transform: scale(0.6);
      opacity: 0;
    }
  }
  @keyframes spark {
    0% {
      opacity: 1;
      transform: translate(0, 0) scale(0.6);
    }
    100% {
      opacity: 0;
      transform: translate(var(--dx), var(--dy)) scale(1);
    }
  }
</style>
