<script lang="ts">
  // Bottom feedback panel (docs/05-f3-mvp0.md §13.3). Colour never carries the meaning alone:
  // every tone has its own icon and title (§13.7). One big primary button; Enter activates it
  // because it receives focus when the panel opens.
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import type { PanelTone } from "./types.ts";
  import Button from "./Button.svelte";

  interface Action {
    label: string;
    onclick: () => void;
  }
  interface Props {
    tone: PanelTone;
    title: string;
    primary: Action;
    secondary?: Action | null;
    /** Move focus to the primary button on open (keyboard flow). */
    autofocus?: boolean;
    children?: Snippet;
  }
  let { tone, title, primary, secondary = null, autofocus = true, children }: Props = $props();
  let button = $state<HTMLElement>();
  const id = $props.id();

  onMount(() => {
    if (autofocus) button?.focus({ preventScroll: false });
  });
</script>

<section class="panel {tone}" aria-labelledby={id} data-testid="feedback" data-tone={tone}>
  <div class="inner">
    <h2 class="title" {id}>
      <span class="badge" aria-hidden="true"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {#if tone === "correct"}
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        {:else if tone === "mixup"}
          <path d="M12 7v6M12 16.5v.5" /><circle cx="12" cy="12" r="9.5" />
        {:else if tone === "wrong"}
          <path d="M7 7l10 10M17 7L7 17" />
        {:else}
          <path d="M19 12a7 7 0 1 1-2.05-4.95M19 5v4h-4" />
        {/if}
      </svg></span>
      <span>{title}</span>
    </h2>
    {#if children}<div class="body">{@render children()}</div>{/if}
    <div class="actions">
      {#if secondary}
        <Button variant="secondary" onclick={secondary.onclick}>{secondary.label}</Button>
      {/if}
      <Button variant={tone} class="main-action" bind:element={button} onclick={primary.onclick} data-testid="feedback-primary">{primary.label}</Button>
    </div>
  </div>
</section>

<style>
  /* A bottom sheet (direction A, docs/05-f3-mvp0.md §17.6): rounded top, the tone's soft colour,
     the icon in a white coin. It sticks to the bottom of the screen while the card scrolls. */
  .panel {
    position: sticky;
    bottom: 0;
    z-index: 2;
    margin: var(--space-6) calc(-1 * var(--space-4)) 0;
    border-top: 3px solid var(--tone);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    background: var(--tone-soft);
    color: var(--color-text);
    animation: rise var(--motion-base) var(--ease-out);
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
  .unavailable {
    --tone: var(--color-text-muted);
    --tone-soft: var(--color-surface);
  }
  .inner {
    display: grid;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-6) var(--space-6);
  }
  .title {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin: 0;
    font-size: var(--text-xl);
    color: var(--tone);
  }
  .badge {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    background: var(--color-surface);
  }
  .icon {
    width: 1.375rem;
    height: 1.375rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    justify-content: flex-end;
  }
  .actions :global(.main-action) {
    flex: 1 1 12rem;
  }
  @keyframes rise {
    from {
      transform: translateY(12px);
      opacity: 0;
    }
  }
</style>
