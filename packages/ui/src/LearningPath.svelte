<script lang="ts">
  // Learning path (docs/05-f3-mvp0.md §13.6): zig-zag nodes, no locks — every node is a link.
  // The zig-zag (−60, 0, +60, 0 px; 104 px apart) is pure CSS, so the static HTML is already
  // laid out before any script runs.
  import { t } from "@educrs/i18n";
  import type { PathModuleView } from "./types.ts";
  interface Props {
    modules: PathModuleView[];
  }
  let { modules }: Props = $props();
</script>

<div class="path" data-testid="learning-path">
  {#each modules as m (m.id)}
    <section class="module" aria-labelledby="mod-{m.id}">
      <h2 id="mod-{m.id}"><span class="mod-id">{t("path.module", { id: m.id })}</span> {m.title}</h2>
      <ol>
        {#each m.nodes as n, i (n.lessonId)}
          <li class="row">
            <a class="node {n.state}" href={n.href} data-testid="path-node" data-lesson={n.lessonId} data-state={n.state}>
              <span class="dot" aria-hidden="true">
                {#if n.state === "completed"}
                  <svg viewBox="0 0 24 24" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                {:else}
                  {i + 1}
                {/if}
              </span>
              <span class="label">
                <span class="title">{n.title}</span>
                <span class="state">{t(`path.state.${n.state}`)}</span>
              </span>
              {#if n.state === "next"}
                <span class="cta" aria-hidden="true">{n.inProgress ? t("path.continue") : t("path.start")}</span>
              {/if}
            </a>
          </li>
        {/each}
      </ol>
    </section>
  {/each}
</div>

<style>
  .path {
    display: grid;
    gap: var(--space-12);
  }
  h2 {
    margin: 0 0 var(--space-6);
    font-size: var(--text-xl);
    text-align: center;
  }
  .mod-id {
    display: block;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-muted);
  }
  ol {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: calc(104px - 4rem); /* node centres 104 px apart (§13.6) */
    justify-items: center;
  }
  .row:nth-child(4n + 1) {
    translate: -60px 0;
  }
  .row:nth-child(4n + 3) {
    translate: 60px 0;
  }
  .node {
    display: grid;
    grid-template-columns: auto;
    justify-items: center;
    gap: var(--space-1);
    color: var(--color-text);
    text-decoration: none;
    text-align: center;
  }
  .dot {
    display: grid;
    place-items: center;
    width: 4rem;
    height: 4rem;
    border-radius: 50%;
    border: 3px dashed var(--color-border);
    background: var(--color-surface);
    font: 700 var(--text-xl) / 1 var(--font-sans);
    color: var(--color-text-muted);
    transition: transform var(--motion-fast) var(--ease-out);
  }
  .completed .dot {
    border: 3px solid var(--color-success);
    background: var(--color-success-soft);
    color: var(--color-success);
  }
  .next .dot {
    width: 5rem;
    height: 5rem;
    border: 4px solid var(--color-accent);
    color: var(--color-accent);
    box-shadow: 0 0 0 6px color-mix(in srgb, var(--color-accent) 18%, transparent);
  }
  .node:hover .dot {
    transform: scale(1.05);
  }
  .node:focus-visible {
    outline: none;
  }
  .node:focus-visible .dot {
    outline: 3px solid var(--color-focus);
    outline-offset: 4px;
  }
  svg {
    width: 2rem;
    height: 2rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .label {
    display: grid;
    max-width: 12rem;
  }
  .title {
    font-weight: 600;
  }
  .state {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  .cta {
    margin-top: var(--space-1);
    padding: var(--space-1) var(--space-3);
    border-radius: 999px;
    background: var(--color-accent);
    color: var(--color-on-accent);
    font-size: var(--text-sm);
    font-weight: 700;
  }
</style>
