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
  const isProject = (lessonId: string) => lessonId.startsWith("lesson:proj.");
  const done = (m: PathModuleView) => m.nodes.filter((n) => n.state === "completed").length;
</script>

<div class="path" data-testid="learning-path">
  {#each modules as m (m.id)}
    <section class="module" aria-labelledby="mod-{m.id}">
      <h2 id="mod-{m.id}"><span class="mod-id">{t("path.module", { id: m.id })}</span> {m.title}</h2>
      <!-- Module progress (docs/05-f3-mvp0.md §17.7): words for everyone, a bar for a quick look. -->
      <div class="progress" data-testid="module-progress">
        <span>{t("path.moduleProgress", { n: done(m), m: m.nodes.length })}</span>
        <span class="bar" aria-hidden="true"><span class="fill" style:width="{Math.round((done(m) / m.nodes.length) * 100)}%"></span></span>
      </div>
      <ol>
        {#each m.nodes as n, i (n.lessonId)}
          <li class="row" class:project={isProject(n.lessonId)}>
            <a class="node {n.state}" href={n.href} data-testid="path-node" data-lesson={n.lessonId} data-state={n.state} data-in-progress={n.inProgress}>
              <span class="dot" aria-hidden="true">
                {#if n.state === "completed"}
                  <svg viewBox="0 0 24 24" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                {:else if isProject(n.lessonId)}
                  <svg class="trophy" viewBox="0 0 24 24" focusable="false"><path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v1.5A3.5 3.5 0 0 0 8.5 11M16 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 13v4M8.5 20h7M10 17h4v3h-4z" /></svg>
                {:else}
                  {i + 1}
                {/if}
              </span>
              <span class="label">
                <span class="title">{n.title}</span>
                <span class="state">{n.inProgress && n.state === "todo" ? t("path.state.inProgress") : t(`path.state.${n.state}`)}</span>
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
    display: grid;
    justify-items: center;
    gap: var(--space-2);
    margin: 0 0 var(--space-6);
    font-size: var(--text-xl);
    text-align: center;
  }
  .mod-id {
    padding: var(--space-1) var(--space-3);
    border-radius: 999px;
    background: var(--color-accent-soft);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-accent);
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
  /* Direction A (docs/05-f3-mvp0.md §17.6): finished lessons are solid "pressable" coins, the
     next one has the coral ring, the rest are dashed outlines. */
  .completed .dot {
    /* transparent, not none: Windows forced-colours mode draws it, so the coin keeps its outline */
    border: 3px solid transparent;
    background: var(--color-accent);
    box-shadow: 0 var(--press) 0 var(--color-accent-shadow);
    color: var(--color-on-accent);
  }
  .next .dot {
    width: 5.25rem;
    height: 5.25rem;
    border: 6px solid var(--color-streak-fill);
    box-shadow: 0 calc(var(--press) + 2px) 0 var(--color-streak);
    color: var(--color-streak);
  }
  .node:hover .dot {
    transform: scale(1.05);
  }
  .node:active .dot {
    transform: translateY(2px);
  }
  .progress {
    display: grid;
    justify-items: center;
    gap: var(--space-1);
    margin: calc(-1 * var(--space-3)) auto var(--space-8);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
  .bar {
    width: 8rem;
    height: 0.5rem;
    border-radius: 999px;
    background: var(--color-border-soft);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--color-success);
  }
  @media (forced-colors: active) {
    .fill {
      forced-color-adjust: none;
      background: Highlight;
    }
  }
  .trophy {
    stroke-width: 2;
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
    margin-top: var(--space-2);
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-sm);
    background: var(--color-accent);
    box-shadow: 0 var(--press) 0 var(--color-accent-shadow);
    color: var(--color-on-accent);
    font-size: var(--text-sm);
    font-weight: 700;
  }
</style>
