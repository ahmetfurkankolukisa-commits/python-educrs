<script lang="ts">
  // Hints, one at a time (docs/05-f3-mvp0.md §13.3). Asking for a hint never costs anything in
  // MVP-0 except a smaller XP multiplier later (§13.5) — the button says how many are left.
  import { t } from "@educrs/i18n";
  import Markdown from "./Markdown.svelte";

  interface Props {
    hints: readonly string[];
    shown: number;
    onmore: () => void;
  }
  let { hints, shown, onmore }: Props = $props();
</script>

{#if hints.length > 0}
  <div class="hints" data-testid="hints">
    {#if shown > 0}
      <ol>
        {#each hints.slice(0, shown) as hint, i (i)}
          <li>
            <span class="label">{t("lesson.hintLabel", { n: i + 1 })}</span>
            <Markdown text={hint} />
          </li>
        {/each}
      </ol>
    {/if}
    {#if shown < hints.length}
      <button type="button" class="more" onclick={onmore}>
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z" /></svg>
        {t("lesson.hint", { n: shown + 1, m: hints.length })}
      </button>
    {/if}
  </div>
{/if}

<style>
  .hints {
    display: grid;
    gap: var(--space-3);
  }
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: var(--space-2);
  }
  li {
    padding: var(--space-3) var(--space-4);
    background: var(--color-accent-soft);
    border-radius: var(--radius-md);
  }
  .label {
    display: block;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-muted);
  }
  .more {
    justify-self: start;
    min-height: var(--target-min);
    padding: 0 var(--space-4);
    border: 2px dashed var(--color-border);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--color-accent);
    font: 700 var(--text-base) / 1 var(--font-sans);
    cursor: pointer;
  }
  .more:hover {
    background: var(--color-accent-soft);
  }
  .more {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
  }
  .more svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .more:focus-visible {
    outline: 3px solid var(--color-focus);
    outline-offset: 2px;
  }
</style>
