<script lang="ts">
  // On/off setting (plain mode, docs/05-f3-mvp0.md §15.5): a native checkbox with role="switch",
  // so Space toggles it and screen readers say "on"/"off". The track is decoration.
  interface Props {
    id: string;
    label: string;
    description?: string;
    checked?: boolean;
    disabled?: boolean;
    onchange?: ((checked: boolean) => void) | undefined;
  }
  let { id, label, description, checked = $bindable(false), disabled = false, onchange }: Props = $props();
</script>

<div class="toggle">
  <label for={id} class="text">
    <span class="label">{label}</span>
    {#if description}<span class="description" id="{id}-description">{description}</span>{/if}
  </label>
  <span class="control">
    <input
      {id}
      type="checkbox"
      role="switch"
      bind:checked
      {disabled}
      aria-describedby={description ? `${id}-description` : undefined}
      onchange={() => onchange?.(checked)}
      data-testid="toggle-{id}"
    />
    <span class="track" aria-hidden="true"><span class="thumb"></span></span>
  </span>
</div>

<style>
  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
  }
  .text {
    display: grid;
    gap: 0.125rem;
    cursor: pointer;
  }
  .label {
    font-weight: 600;
  }
  .description {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  .control {
    position: relative;
    flex: 0 0 auto;
    display: inline-grid;
    width: 3.25rem;
    height: var(--target-min);
    place-items: center;
  }
  input {
    /* The real control covers the drawn one, so taps and clicks land on it. */
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .track {
    width: 3.25rem;
    height: 1.75rem;
    padding: 0.1875rem;
    border: 2px solid var(--color-border);
    border-radius: 999px;
    background: var(--color-surface);
    transition: background-color var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out);
  }
  .thumb {
    display: block;
    width: 1.125rem;
    height: 1.125rem;
    border-radius: 50%;
    background: var(--color-text-muted);
    transition: translate var(--motion-fast) var(--ease-out);
  }
  input:checked + .track {
    border-color: var(--color-accent);
    background: var(--color-accent);
  }
  input:checked + .track .thumb {
    translate: 1.5rem 0;
    background: var(--color-on-accent);
  }
  input:focus-visible + .track {
    outline: 3px solid var(--color-focus);
    outline-offset: 2px;
  }
  input:disabled + .track {
    opacity: 0.6;
  }
</style>
