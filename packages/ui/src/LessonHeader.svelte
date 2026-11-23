<script lang="ts">
  // Top bar of a lesson: leave (×) and a progress bar (docs/05-f3-mvp0.md §13.1).
  import { t } from "@educrs/i18n";

  interface Props {
    /** Steps finished so far. */
    done: number;
    total: number;
    exitHref: string;
  }
  let { done, total, exitHref }: Props = $props();
  const pct = $derived(total > 0 ? Math.round((Math.min(done, total) / total) * 100) : 0);
</script>

<header class="bar">
  <a class="exit" href={exitHref} aria-label={t("lesson.exit")} data-testid="lesson-exit">
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" /></svg>
  </a>
  <div
    class="track"
    role="progressbar"
    aria-label={t("lesson.progress")}
    aria-valuemin={0}
    aria-valuemax={total}
    aria-valuenow={Math.min(done, total)}
    aria-valuetext={t("lesson.stepOf", { n: Math.min(done + 1, total), m: total })}
    data-testid="lesson-progress"
  >
    <div class="fill" style:width="{pct}%"></div>
  </div>
</header>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }
  .exit {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: var(--target-min);
    height: var(--target-min);
    border-radius: 50%;
    color: var(--color-text-muted);
  }
  .exit:hover {
    color: var(--color-text);
    background: var(--color-accent-soft);
  }
  .exit:focus-visible {
    outline: 3px solid var(--color-focus);
    outline-offset: 2px;
  }
  svg {
    width: 1.5rem;
    height: 1.5rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
  }
  .track {
    flex: 1;
    height: 0.875rem;
    border-radius: 999px;
    background: var(--color-border-soft);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: inherit;
    background: var(--color-accent);
    transition: width var(--motion-base) var(--ease-out);
  }
  @media (forced-colors: active) {
    .track {
      border: 1px solid CanvasText;
    }
    .fill {
      forced-color-adjust: none;
      background: Highlight;
    }
  }
</style>
