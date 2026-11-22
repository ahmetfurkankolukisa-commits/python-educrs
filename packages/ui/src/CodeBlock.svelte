<script lang="ts">
  // Read-only code (a predict program, an example). Plain and light: no CodeMirror here, so
  // cards that only show code never wait for the editor chunk.
  import type { Snippet } from "svelte";

  interface Props {
    code: string;
    label: string;
    /** Optional output shown under the code. */
    output?: string | null;
    outputLabel?: string;
    /** Replaces the code text (e.g. GapFill draws the gap itself). */
    children?: Snippet;
  }
  let { code, label, output = null, outputLabel = "Output", children }: Props = $props();
</script>

<figure class="block">
  <figcaption class="sr-only">{label}</figcaption>
  <pre class="code" data-testid="code-block"><code>{#if children}{@render children()}{:else}{code}{/if}</code></pre>
  {#if output !== null}
    <div class="out">
      <span class="out-label">{outputLabel}</span>
      <pre class="out-text">{output}</pre>
    </div>
  {/if}
</figure>

<style>
  .block {
    margin: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow: hidden;
    background: var(--color-code-bg);
  }
  pre {
    margin: 0;
    font: 16px/1.5 var(--font-mono);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .code {
    padding: var(--space-3) var(--space-4);
    color: var(--color-text);
  }
  .out {
    border-top: 1px solid var(--color-border);
    padding: var(--space-2) var(--space-4) var(--space-3);
    background: var(--color-surface);
  }
  .out-label {
    display: block;
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  .out-text {
    color: var(--color-text);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
</style>
