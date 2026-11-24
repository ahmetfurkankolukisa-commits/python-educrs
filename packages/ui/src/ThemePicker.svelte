<script lang="ts">
  // Colour theme choice (docs/05-f3-mvp0.md §17.18): a native radio group like GoalPicker, so the
  // arrow keys and "2 of 4" come from the browser. Each option shows a small sample of its theme.
  // The sample is an element carrying that theme's `data-theme`: tokens.css opens the theme's
  // colours on ANY element with the attribute, so no colour is written a second time here.
  import { t, type MessageKey } from "@educrs/i18n";
  import type { ThemeChoice } from "./types.ts";

  interface Props {
    themes: readonly ThemeChoice[];
    selected?: ThemeChoice;
    /** Group name (unique per page). */
    name: string;
    legend: string;
    onchange?: ((theme: ThemeChoice) => void) | undefined;
  }
  let { themes, selected = $bindable("system"), name, legend, onchange }: Props = $props();

  const NAMES: Readonly<Record<ThemeChoice, MessageKey>> = {
    system: "settings.theme.system",
    light: "settings.theme.light",
    dark: "settings.theme.dark",
    "high-contrast": "settings.theme.highContrast",
  };

  function pick(theme: ThemeChoice) {
    selected = theme;
    onchange?.(theme);
  }
</script>

<fieldset class="picker" data-testid="theme-picker">
  <legend>{legend}</legend>
  <div class="options">
    {#each themes as theme (theme)}
      <label class="option" class:selected={selected === theme} data-choice={theme}>
        <input class="sr-only" type="radio" {name} value={theme} checked={selected === theme} onchange={() => pick(theme)} />
        <span class="sample" aria-hidden="true">
          {#if theme === "system"}
            <!-- the device decides: half light, half dark -->
            <span class="part" data-theme="light"><i></i></span><span class="part" data-theme="dark"><i></i></span>
          {:else}
            <span class="part" data-theme={theme}><i></i></span>
          {/if}
        </span>
        <span class="name">{t(NAMES[theme])}</span>
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
    grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
    gap: var(--space-2);
  }
  .option {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--target-min);
    padding: var(--space-2) var(--space-3);
    border: 2px solid var(--color-border-soft);
    border-bottom: var(--press) solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
    touch-action: manipulation;
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
  .sample {
    flex: 0 0 auto;
    display: flex;
    width: 2.5rem;
    height: 1.75rem;
    border: 2px solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }
  /* Inside a `data-theme` element the tokens are that theme's own. */
  .part {
    flex: 1;
    display: grid;
    place-items: center;
    background: var(--color-bg);
  }
  .part i {
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 50%;
    background: var(--color-accent);
  }
  .name {
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
