<script lang="ts">
  // Renders our Markdown subset (markdown.ts) as real elements — never as an HTML string.
  import { parseInline, parseMarkdown, type Inline } from "./markdown.ts";

  interface Props {
    text: string;
    /** Inline only (one line of text, no paragraphs or code blocks), e.g. inside a button or label. */
    inline?: boolean;
  }
  let { text, inline = false }: Props = $props();
  const blocks = $derived(inline ? [] : parseMarkdown(text));
  const inlines = $derived(inline ? parseInline(text) : []);
</script>

{#snippet nodes(list: readonly Inline[])}
  {#each list as n, i (i)}
    {#if n.kind === "text"}{n.text}{:else if n.kind === "code"}<code class="md-code">{n.text}</code>{:else if n.kind === "strong"}<strong>{@render nodes(n.children)}</strong>{:else}<em>{@render nodes(n.children)}</em>{/if}
  {/each}
{/snippet}

{#if inline}
  {@render nodes(inlines)}
{:else}
  <div class="md">
    {#each blocks as b, i (i)}
      {#if b.kind === "p"}
        <p>{@render nodes(b.children)}</p>
      {:else}
        <pre class="md-pre"><code>{b.text}</code></pre>
      {/if}
    {/each}
  </div>
{/if}

<style>
  .md > :global(* + *) {
    margin-top: var(--space-3);
  }
  p {
    margin: 0;
    line-height: var(--leading);
  }
  .md-code {
    font-family: var(--font-mono);
    font-size: 0.92em;
    padding: 0.05em 0.3em;
    border-radius: var(--radius-sm);
    background: var(--color-code-bg);
    border: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
  }
  .md-pre {
    margin: 0;
    padding: var(--space-3);
    font: 16px/1.5 var(--font-mono);
    white-space: pre-wrap; /* wrap instead of a sideways-scrolling region (axe, small phones) */
    overflow-wrap: anywhere;
    background: var(--color-code-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }
</style>
