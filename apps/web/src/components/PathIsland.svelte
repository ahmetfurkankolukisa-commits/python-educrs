<script lang="ts">
  // Learning path with states from the learner's own events (docs/05-f3-mvp0.md §13.6), and the
  // stats bar above it (§15.7). The static HTML already shows every lesson as a working link
  // (first one "next") and the settings link; stats and real states appear once the store is read.
  import { onMount } from "svelte";
  import { t } from "@educrs/i18n";
  import { LearningPath, StatsBar, type PathModuleView } from "@educrs/ui";
  import { pathStates, type PathModule, type PathNode } from "@educrs/core";
  import { progressOf, type Progress } from "@educrs/gamification";
  import { nowLocal, openProgress } from "../lib/progress.ts";

  interface Props {
    modules: { id: string; title: string; nodes: { lessonId: string; title: string; href: string }[] }[];
    path: readonly PathModule[];
    settingsHref: string;
  }
  let { modules, path, settingsHref }: Props = $props();
  /** null until the store is read: until then, the states of a learner with no events. */
  let read = $state<PathNode[] | null>(null);
  const states = $derived(read ?? pathStates(path, []));
  let stats = $state<Progress | null>(null);
  let loaded = $state(false);

  const view = $derived<PathModuleView[]>(modules.map((m) => ({
    id: m.id,
    title: m.title,
    nodes: m.nodes.map((n) => {
      const s = states.find((x) => x.lessonId === n.lessonId);
      return { ...n, state: s?.state ?? "todo", inProgress: s?.inProgress ?? false };
    }),
  })));

  onMount(() => {
    let cancelled = false;
    openProgress().then((progress) => {
      if (cancelled) return;
      const events = progress.events();
      read = pathStates(path, events);
      stats = progressOf(events, nowLocal());
      loaded = true;
    });
    return () => { cancelled = true; };
  });
</script>

<div class="flex min-h-11 flex-wrap items-start justify-between gap-4">
  <div>
    {#if stats && !stats.settings.plainMode}
      <StatsBar streak={stats.streak.days} todayMet={stats.streak.todayMet} freezes={stats.streak.freezes} xp={stats.xp} todayXp={stats.todayXp} goal={stats.goal} />
    {/if}
  </div>
  <a class="inline-flex min-h-11 items-center gap-2 rounded-md px-3 font-semibold text-accent" href={settingsHref} data-testid="settings-link">
    <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
    {t("nav.settings")}
  </a>
</div>

<div class="mt-10" data-testid="path" data-loaded={loaded}>
  <LearningPath modules={view} />
</div>
