<script lang="ts">
  // End-of-lesson screen (docs/05-f3-mvp0.md §13.5). "Right on the first try" is shown here
  // only; it never affects XP (no penalty for wrong answers). XP and streak arrive in F3.6.
  import { onMount } from "svelte";
  import { t } from "@educrs/i18n";

  interface Props {
    lessonTitle: string;
    exercises: number;
    firstTry: number;
    nextHref?: string | null;
    pathHref: string;
  }
  let { lessonTitle, exercises, firstTry, nextHref = null, pathHref }: Props = $props();
  let heading = $state<HTMLHeadingElement>();
  onMount(() => heading?.focus());
</script>

<section class="done" data-testid="lesson-complete">
  <svg class="badge" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <circle cx="32" cy="32" r="29" />
    <path d="M19 33l9 9 17-18" />
  </svg>
  <h1 tabindex="-1" bind:this={heading}>{t("lesson.complete.title")}</h1>
  <p class="lesson">{lessonTitle}</p>
  <p class="stat">{t("lesson.complete.firstTry", { n: firstTry, m: exercises })}</p>
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
