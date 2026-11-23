<script lang="ts">
  // Daily goal choice (docs/05-f3-mvp0.md §15.3): a native radio group, so arrow keys and
  // "2 of 4" announcements come from the browser. No number-key shortcuts: this sits on pages
  // where digits mean nothing (settings, end of a lesson).
  import { t, type MessageKey } from "@educrs/i18n";

  interface Props {
    goals: readonly number[];
    selected?: number | null;
    /** Group name (unique per page). */
    name: string;
    legend: string;
    /** Show the legend (settings page) or keep it for screen readers only (a heading says it). */
    showLegend?: boolean;
    onchange?: ((goal: number) => void) | undefined;
  }
  let { goals, selected = $bindable(null), name, legend, showLegend = false, onchange }: Props = $props();

  const NAMES: Readonly<Record<number, MessageKey>> = { 10: "goal.casual", 20: "goal.regular", 30: "goal.serious", 50: "goal.intense" };

  function pick(goal: number) {
    selected = goal;
    onchange?.(goal);
  }
</script>

<fieldset class="picker" data-testid="goal-picker">
  <legend class:sr-only={!showLegend}>{legend}</legend>
  <div class="options">
    {#each goals as goal (goal)}
      {@const nameKey = NAMES[goal]}
      <label class="option" class:selected={selected === goal} data-goal={goal}>
        <input class="sr-only" type="radio" {name} value={goal} checked={selected === goal} onchange={() => pick(goal)} />
        {#if nameKey}<span class="name">{t(nameKey)}</span>{/if}
        <span class="amount">{t("goal.xpPerDay", { n: goal })}</span>
      </label>
    {/each}
  </div>
</fieldset>

<style>
  .picker {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  legend {
    padding: 0;
    margin-bottom: var(--space-2);
    font-weight: 600;
  }
  .options {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
    gap: var(--space-2);
  }
  .option {
    position: relative;
    display: grid;
    gap: 0.125rem;
    min-height: var(--target-min);
    padding: var(--space-2) var(--space-3);
    border: 2px solid var(--color-border-soft);
    border-bottom: var(--press) solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
    touch-action: manipulation;
    text-align: left;
  }
  .option:hover {
    border-color: var(--color-accent);
  }
  .option.selected {
    border-color: var(--color-accent);
    border-bottom-color: var(--color-accent-shadow);
    background: var(--color-accent-soft);
  }
  .option:has(input:focus-visible) {
    outline: 3px solid var(--color-focus);
    outline-offset: 2px;
  }
  .name {
    font-weight: 700;
  }
  .amount {
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
