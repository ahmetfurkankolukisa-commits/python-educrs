<script lang="ts">
  // One button for the whole app (docs/05-f3-mvp0.md §17.6, direction A): "pressable" — a solid
  // edge under it that disappears when it is pressed. With `href` it is a link that looks like a
  // button (navigation stays a link for assistive technology). Other attributes (data-testid,
  // onclick, aria-*) pass straight through.
  import type { Snippet } from "svelte";
  import type { HTMLAttributes } from "svelte/elements";

  type Variant = "primary" | "secondary" | "correct" | "mixup" | "wrong" | "unavailable";
  interface Props extends Omit<HTMLAttributes<HTMLElement>, "children"> {
    variant?: Variant;
    href?: string | null;
    type?: "button" | "submit";
    disabled?: boolean;
    /** Fill the width of the container (phones, panels). */
    wide?: boolean;
    /** The rendered element, e.g. to move focus to it. */
    element?: HTMLElement | undefined;
    children?: Snippet;
  }
  let {
    variant = "primary",
    href = null,
    type = "button",
    disabled = false,
    wide = false,
    element = $bindable(),
    children,
    class: cls = "",
    ...rest
  }: Props = $props();
</script>

{#if href}
  <a bind:this={element} {href} class="btn {variant} {cls}" class:wide {...rest}>{@render children?.()}</a>
{:else}
  <button bind:this={element} {type} {disabled} class="btn {variant} {cls}" class:wide {...rest}>{@render children?.()}</button>
{/if}

<style>
  .btn {
    --edge: var(--color-accent-shadow);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: var(--target-min);
    margin-bottom: var(--press);
    padding: var(--space-2) var(--space-6);
    border: 2px solid transparent;
    border-radius: var(--radius-md);
    box-shadow: 0 var(--press) 0 var(--edge);
    font: 700 var(--text-base) / 1.2 var(--font-sans);
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    touch-action: manipulation;
    transition: transform var(--motion-fast) var(--ease-out), box-shadow var(--motion-fast) var(--ease-out);
  }
  .btn:active:not(:disabled) {
    transform: translateY(var(--press));
    box-shadow: 0 0 0 var(--edge);
  }
  .btn:focus-visible {
    outline: 3px solid var(--color-focus);
    outline-offset: 3px;
  }
  .btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
    box-shadow: none;
    transform: translateY(var(--press));
  }
  .wide {
    display: flex;
    width: 100%;
  }
  .primary {
    background: var(--color-accent);
    color: var(--color-on-accent);
  }
  .secondary,
  .unavailable {
    --edge: var(--color-border);
    background: var(--color-surface);
    border-color: var(--color-border-soft);
    color: var(--color-text);
  }
  .correct {
    --edge: color-mix(in srgb, var(--color-success) 65%, #000000);
    background: var(--color-success);
    color: var(--color-on-accent);
  }
  .mixup {
    --edge: color-mix(in srgb, var(--color-warning-strong) 65%, #000000);
    background: var(--color-warning-strong);
    color: var(--color-on-warning-strong);
  }
  .wrong {
    --edge: color-mix(in srgb, var(--color-danger) 65%, #000000);
    background: var(--color-danger);
    color: var(--color-on-accent);
  }
</style>
