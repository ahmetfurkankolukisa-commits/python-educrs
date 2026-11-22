<script lang="ts">
  // Learning path with states from the learner's own events (docs/05-f3-mvp0.md §13.6).
  // The static HTML already shows every lesson as a working link (first one "next"); real
  // states replace it once the store is read.
  import { onMount } from "svelte";
  import { LearningPath, type PathModuleView } from "@educrs/ui";
  import { pathStates, type PathModule, type PathNode } from "@educrs/core";
  import { openLocalStore } from "@educrs/store";

  interface Props {
    modules: { id: string; title: string; nodes: { lessonId: string; title: string; href: string }[] }[];
    path: readonly PathModule[];
  }
  let { modules, path }: Props = $props();
  let states = $state<PathNode[]>(pathStates(path, []));
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
    openLocalStore().then(async ({ store }) => {
      const events = await store.all();
      if (cancelled) return;
      states = pathStates(path, events);
      loaded = true;
    });
    return () => { cancelled = true; };
  });
</script>

<div data-testid="path" data-loaded={loaded}>
  <LearningPath modules={view} />
</div>
