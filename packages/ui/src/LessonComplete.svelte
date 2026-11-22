<script lang="ts">
  // End-of-lesson screen (docs/05-f3-mvp0.md §13.5, §15.7). "Right on the first try" is shown
  // here only and never affects XP (no penalty for wrong answers). Plain mode shows the plain
  // facts: no badge, no numbers, no celebration (plan §3.5.1 #4).
  import { onMount, type Snippet } from "svelte";
  import { t } from "@educrs/i18n";
  import GoalRing from "./GoalRing.svelte";

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
</script>

<section class="done" data-testid="lesson-complete" data-plain={plain}>
  {#if !plain}
    <svg class="badge" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="32" cy="32" r="29" />
      <path d="M19 33l9 9 17-18" />
    </svg>
  {/if}
  <h1 tabindex="-1" bind:this={heading}>{t("lesson.complete.title")}</h1>
  <p class="lesson">{lessonTitle}</p>
  {#if !plain}
    <p class="stat">{t("lesson.complete.firstTry", { n: firstTry, m: exercises })}</p>
    {#if rewards}
      <ul class="rewards" data-testid="rewards">
        <li class="xp" data-testid="reward-xp" data-xp={rewards.xp}>
          <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M13.5 2 4.5 13.5h6.2L9.8 22l9.4-12.2h-6.4z" /></svg>
          {t("lesson.complete.xp", { n: rewards.xp })}
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
    {#if nextHref}<a class="btn primary" href={nextHref}>{t("lesson.complete.next")}</a>{/if}
    <a class="btn" class:primary={!nextHref} href={pathHref}>{t("lesson.complete.path")}</a>
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
  .badge {
    width: 5rem;
    height: 5rem;
    fill: var(--color-success-soft);
    stroke: var(--color-success);
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
    animation: pop var(--motion-base) var(--ease-out);
  }
  h1 {
    margin: 0;
    font-size: var(--text-3xl);
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
    padding: var(--space-1) var(--space-3);
    border: 1px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-surface);
    font-weight: 600;
  }
  .icon {
    width: 1.25rem;
    height: 1.25rem;
  }
  .xp {
    color: var(--color-xp);
  }
  .xp .icon {
    fill: var(--color-xp);
  }
  .streak {
    color: var(--color-streak);
  }
  .streak .icon {
    fill: var(--color-streak);
  }
  .goal.celebrate {
    border-color: var(--color-success);
    animation: pop var(--motion-base) var(--ease-out);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-3);
    margin-top: var(--space-4);
  }
  .btn {
    display: inline-grid;
    place-items: center;
    min-height: var(--target-min);
    padding: 0 var(--space-6);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text);
    font-weight: 600;
    text-decoration: none;
  }
  .btn.primary {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-on-accent);
  }
  .btn:focus-visible {
    outline: 3px solid var(--color-focus);
    outline-offset: 2px;
  }
  @keyframes pop {
    from {
      transform: scale(0.6);
      opacity: 0;
    }
  }
</style>
