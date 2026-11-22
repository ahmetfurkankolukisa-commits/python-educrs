<script lang="ts">
  // Daily goal ring (docs/05-f3-mvp0.md §15.7). Progress is drawn with the SVG attribute
  // stroke-dasharray on a pathLength of 100, not with a style, so it needs nothing from the CSP.
  interface Props {
    value: number;
    goal: number;
    /** Accessible name, e.g. "Daily goal". */
    label: string;
    /** What a screen reader says for the value, e.g. "15 of 20 XP today". */
    valueText: string;
    size?: "sm" | "lg";
  }
  let { value, goal, label, valueText, size = "sm" }: Props = $props();
  const pct = $derived(goal > 0 ? Math.min(100, Math.round((Math.max(0, value) / goal) * 100)) : 0);
  const met = $derived(goal > 0 && value >= goal);
</script>

<div
  class="ring {size}"
  class:met
  role="progressbar"
  aria-label={label}
  aria-valuemin={0}
  aria-valuemax={goal}
  aria-valuenow={Math.min(Math.max(0, value), goal)}
  aria-valuetext={valueText}
  data-testid="goal-ring"
  data-value={value}
  data-goal={goal}
>
  <svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <circle class="track" cx="18" cy="18" r="15" pathLength="100" />
    {#if pct > 0}
      <circle class="fill" cx="18" cy="18" r="15" pathLength="100" stroke-dasharray="{pct} 100" transform="rotate(-90 18 18)" />
    {/if}
    {#if met}<path class="check" d="M12 18.5l4 4 8-9" />{/if}
  </svg>
</div>

<style>
  .ring {
    flex: 0 0 auto;
    display: inline-grid;
    place-items: center;
  }
  .sm {
    width: 2.25rem;
    height: 2.25rem;
  }
  .lg {
    width: 3.5rem;
    height: 3.5rem;
  }
  svg {
    width: 100%;
    height: 100%;
    fill: none;
  }
  circle {
    stroke-width: 4;
  }
  .track {
    stroke: color-mix(in srgb, var(--color-border) 35%, transparent);
  }
  .fill {
    stroke: var(--color-success);
    stroke-linecap: round;
    transition: stroke-dasharray var(--motion-base) var(--ease-out);
  }
  .check {
    stroke: var(--color-success);
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
