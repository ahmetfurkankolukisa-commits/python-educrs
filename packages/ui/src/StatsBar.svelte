<script lang="ts">
  // Streak, XP and today's goal above the learning path (docs/05-f3-mvp0.md §13.6, §15.7).
  // Short visible captions; screen readers get one full sentence per item instead. Hidden in
  // plain mode by the app (this component never decides that).
  import { plural, t } from "@educrs/i18n";
  import GoalRing from "./GoalRing.svelte";

  interface Props {
    streak: number;
    todayMet: boolean;
    freezes: number;
    xp: number;
    todayXp: number;
    goal: number;
  }
  let { streak, todayMet, freezes, xp, todayXp, goal }: Props = $props();

  const streakSr = $derived(
    [
      t("stats.streak.sr", { n: streak }),
      todayMet ? t("stats.streak.done") : streak > 0 ? t("stats.streak.todo") : t("stats.streak.start"),
      freezes > 0 ? `${plural("stats.freezes", freezes)}.` : "",
    ].filter(Boolean).join(" "),
  );
</script>

<section class="stats" aria-label={t("stats.label")} data-testid="stats">
  <div class="stat" data-testid="stat-streak" data-days={streak} data-lit={todayMet} data-freezes={freezes}>
    <div class="top">
      <svg class="icon flame" class:lit={todayMet} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 2.5c.6 3.2 4.8 5.4 4.8 10.3a4.8 4.8 0 0 1-9.6 0c0-2.3 1.2-3.9 2.4-5 .1 1.6.8 2.7 1.8 3.3-.4-3 .1-5.9.6-8.6z" />
      </svg>
      <span class="num" aria-hidden="true">{streak}</span>
      {#if freezes > 0}
        <span class="freeze" aria-hidden="true" title={plural("stats.freezes", freezes)}>
          <svg viewBox="0 0 24 24" focusable="false"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" /></svg>{freezes}
        </span>
      {/if}
    </div>
    <span class="cap" aria-hidden="true">{t("stats.streak.caption")}</span>
    <span class="sr-only">{streakSr}</span>
  </div>

  <div class="stat" data-testid="stat-xp" data-xp={xp}>
    <div class="top">
      <svg class="icon bolt" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M13.5 2 4.5 13.5h6.2L9.8 22l9.4-12.2h-6.4z" /></svg>
      <span class="num" aria-hidden="true">{xp}</span>
    </div>
    <span class="cap" aria-hidden="true">{t("stats.xp.caption")}</span>
    <span class="sr-only">{t("stats.xp.sr", { n: xp })}</span>
  </div>

  <div class="stat" data-testid="stat-goal">
    <div class="top">
      <GoalRing value={todayXp} {goal} label={t("stats.goal.label")} valueText={t("stats.goal.value", { n: todayXp, m: goal })} />
      <span class="frac" aria-hidden="true">{todayXp}<span class="of">/{goal}</span></span>
    </div>
    <span class="cap" aria-hidden="true">{t("stats.goal.caption")}</span>
  </div>
</section>

<style>
  .stats {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-4) var(--space-6);
  }
  .stat {
    display: grid;
    justify-items: center;
    gap: var(--space-1);
    min-width: 4.5rem;
  }
  /* Pills (direction A, docs/05-f3-mvp0.md §17.6). */
  .top {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 2.75rem;
    padding: var(--space-1) var(--space-3);
    border: 2px solid var(--color-border-soft);
    border-radius: 999px;
    background: var(--color-surface);
  }
  .icon {
    width: 1.5rem;
    height: 1.5rem;
  }
  .flame {
    fill: none;
    stroke: var(--color-text-muted);
    stroke-width: 2;
    stroke-linejoin: round;
  }
  .flame.lit {
    fill: var(--color-streak-fill);
    stroke: var(--color-streak);
  }
  .bolt {
    fill: var(--color-xp);
  }
  .num,
  .frac {
    font-size: var(--text-xl);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .of {
    font-size: var(--text-base);
    font-weight: 600;
    color: var(--color-text-muted);
  }
  .freeze {
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-accent);
  }
  .freeze svg {
    width: 1rem;
    height: 1rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }
  .cap {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
