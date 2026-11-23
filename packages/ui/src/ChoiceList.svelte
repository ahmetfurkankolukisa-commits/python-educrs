<script lang="ts">
  // Answer options as a native radio group: arrow keys, "1 of 4" announcements and form
  // semantics come from the browser. Number keys 1–9 pick an option (docs/05-f3-mvp0.md §13.3).
  import { t } from "@educrs/i18n";

  interface Props {
    options: readonly string[];
    selected?: string | null;
    /** Group name (unique per page) and its accessible label. */
    name: string;
    legend: string;
    disabled?: boolean;
    /** Marks this option as the right answer ("Show me"). */
    highlight?: string | null;
    /** After a check: the picked option takes the feedback's tone and mark (docs/05-f3-mvp0.md §17.7). */
    result?: "correct" | "mixup" | "wrong" | "unavailable" | null;
    /** "list": full-width rows (outputs); "tiles": compact chips (code fragments). */
    variant?: "list" | "tiles";
    /** Listen for number keys. Only one active list per page should have this on. */
    shortcuts?: boolean;
    onchange?: ((value: string) => void) | undefined;
  }
  let {
    options,
    selected = $bindable(null),
    name,
    legend,
    disabled = false,
    highlight = null,
    result = null,
    variant = "list",
    shortcuts = true,
    onchange,
  }: Props = $props();

  function pick(value: string) {
    if (disabled) return;
    selected = value;
    onchange?.(value);
  }

  function onKey(e: KeyboardEvent) {
    if (!shortcuts || disabled || e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement | null;
    const typing = el?.isContentEditable || el?.tagName === "TEXTAREA" || (el?.tagName === "INPUT" && (el as HTMLInputElement).type !== "radio");
    if (typing) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= options.length) {
      e.preventDefault();
      pick(options[n - 1] as string);
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<fieldset class="choices {variant}" {disabled} data-testid="choices">
  <legend class="sr-only">{legend}</legend>
  {#each options as opt, i (opt)}
    {@const tone = selected === opt && result && result !== "unavailable" ? result : null}
    <label class="choice {tone ? `result ${tone}` : ''}" class:selected={selected === opt} class:highlight={highlight === opt} data-choice={opt} data-result={tone}>
      <input class="sr-only" type="radio" {name} value={opt} checked={selected === opt} onchange={() => pick(opt)} />
      {#if variant === "list"}<span class="key" aria-hidden="true">{i + 1}</span>{/if}
      <span class="text">{opt}</span>
      {#if highlight === opt}<span class="sr-only">{t("lesson.reveal.answer")}</span><span class="mark" aria-hidden="true">✓</span>
      {:else if tone}<span class="mark" aria-hidden="true">{tone === "correct" ? "✓" : tone === "mixup" ? "!" : "×"}</span>{/if}
    </label>
  {/each}
</fieldset>

<style>
  .choices {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
    display: grid;
    gap: var(--space-2);
  }
  .tiles {
    display: flex;
    flex-wrap: wrap;
  }
  .choice {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--target-min);
    padding: var(--space-3) var(--space-4);
    /* Soft sides and a darker bottom edge: the edge gives the 3:1 boundary (WCAG 1.4.11) and the
       "pressable" look of direction A (docs/05-f3-mvp0.md §17.6). */
    border: 2px solid var(--color-border-soft);
    border-bottom: var(--press) solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
    touch-action: manipulation;
    transition: border-color var(--motion-fast) var(--ease-out), background-color var(--motion-fast) var(--ease-out), transform var(--motion-fast) var(--ease-out);
  }
  .choice:active {
    transform: translateY(2px);
  }
  .tiles .choice {
    min-width: var(--target-min);
    justify-content: center;
  }
  .choice:hover {
    border-color: var(--color-accent);
  }
  .choice.selected {
    border-color: var(--color-accent);
    border-bottom-color: var(--color-accent-shadow);
    background: var(--color-accent-soft);
  }
  .choice.highlight {
    border-color: var(--color-success);
    border-style: dashed;
    border-bottom-style: solid;
    background: var(--color-success-soft);
  }
  .choice.result {
    border-color: var(--tone);
    border-bottom-color: var(--tone);
    background: var(--tone-soft);
  }
  .correct {
    --tone: var(--color-success);
    --tone-soft: var(--color-success-soft);
  }
  .mixup {
    --tone: var(--color-warning);
    --tone-soft: var(--color-warning-soft);
  }
  .wrong {
    --tone: var(--color-danger);
    --tone-soft: var(--color-danger-soft);
  }
  .result .mark {
    color: var(--tone);
  }
  /* A small "yes!" when the pick was right (0 ms under reduced motion: --motion-base). */
  .choice.result.correct {
    animation: right var(--motion-base) var(--ease-out);
  }
  @keyframes right {
    50% {
      transform: scale(1.03);
    }
  }
  .choice.result .key {
    border-color: var(--tone);
    color: var(--tone);
  }
  .choice:has(input:focus-visible) {
    outline: 3px solid var(--color-focus);
    outline-offset: 2px;
  }
  fieldset:disabled .choice:not(.result):not(.highlight) {
    cursor: default;
    opacity: 0.75;
  }
  .key {
    flex: 0 0 auto;
    display: inline-grid;
    place-items: center;
    width: 1.875rem;
    height: 1.875rem;
    border: 2px solid var(--color-border-soft);
    border-radius: var(--radius-sm);
    font: 600 var(--text-sm) / 1 var(--font-sans);
    color: var(--color-text-muted);
  }
  .selected .key {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
  .text {
    font: 16px/1.4 var(--font-mono);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .mark {
    margin-left: auto;
    color: var(--color-success);
    font-weight: 700;
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
