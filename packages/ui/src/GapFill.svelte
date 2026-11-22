<script lang="ts">
  // A program with one gap and tiles to fill it (fill-gap, docs/05-f3-mvp0.md §13.4).
  // Phones: no keyboard needed — tap a tile and it appears in the gap.
  import { t } from "@educrs/i18n";
  import ChoiceList from "./ChoiceList.svelte";
  import CodeBlock from "./CodeBlock.svelte";

  const GAP = "____";
  const BLANK = " ".repeat(4);

  interface Props {
    template: string;
    tiles: readonly string[];
    selected?: string | null;
    name: string;
    disabled?: boolean;
    highlight?: string | null;
    onchange?: ((value: string) => void) | undefined;
  }
  let { template, tiles, selected = $bindable(null), name, disabled = false, highlight = null, onchange }: Props = $props();
  const parts = $derived.by(() => {
    const i = template.indexOf(GAP);
    return i < 0 ? [template, ""] : [template.slice(0, i), template.slice(i + GAP.length)];
  });
</script>

<div class="gapfill">
  <CodeBlock code={template} label={t("lesson.program")}>
    {parts[0]}<span class="gap" class:filled={selected !== null} data-testid="gap">{#if selected === null}<span aria-hidden="true">{BLANK}</span><span class="sr-only">({t("lesson.gap")})</span>{:else}{selected}{/if}</span>{parts[1]}
  </CodeBlock>
  <ChoiceList options={tiles} bind:selected {name} legend={t("lesson.tiles")} {disabled} {highlight} variant="tiles" {onchange} />
</div>

<style>
  .gapfill {
    display: grid;
    gap: var(--space-4);
  }
  .gap {
    display: inline-block;
    min-width: 3ch;
    padding: 0 0.25em;
    border-bottom: 2px dashed var(--color-accent);
    color: var(--color-text);
  }
  .gap.filled {
    border-bottom-style: solid;
    background: color-mix(in srgb, var(--color-accent) 12%, transparent);
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
