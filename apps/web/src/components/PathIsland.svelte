<script lang="ts">
  // Learning path with states from the learner's own events (docs/05-f3-mvp0.md §13.6), and the
  // stats bar above it (§15.7). The static HTML already shows every lesson as a working link
  // (first one "next") and the settings link; stats and real states appear once the store is read.
  import { onMount } from "svelte";
  import { LearningPath, StatsBar, type PathModuleView } from "@educrs/ui";
  import { pathStates, type PathModule, type PathNode } from "@educrs/core";
  import { progressOf, type Progress } from "@educrs/gamification";
  import { nowLocal, openProgress } from "../lib/progress.ts";

  interface Props {
    modules: { id: string; title: string; nodes: { lessonId: string; title: string; href: string }[] }[];
    path: readonly PathModule[];
  }
  let { modules, path }: Props = $props();
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

<!-- Fixed height, so the path doesn't jump when the numbers appear (or stays put in plain mode). -->
<div class="flex min-h-[4.75rem] justify-center">
  {#if stats && !stats.settings.plainMode}
    <StatsBar streak={stats.streak.days} todayMet={stats.streak.todayMet} freezes={stats.streak.freezes} xp={stats.xp} todayXp={stats.todayXp} goal={stats.goal} />
  {/if}
</div>

<div class="mt-10" data-testid="path" data-loaded={loaded}>
  <LearningPath modules={view} />
</div>
