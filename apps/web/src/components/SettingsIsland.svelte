<script lang="ts">
  // Settings (docs/05-f3-mvp0.md §15.3, §15.5, §15.6): daily goal, plain mode, download my data.
  // Settings are events like everything else, so they will sync later; nothing leaves the device.
  import { onMount } from "svelte";
  import { t } from "@educrs/i18n";
  import { GoalPicker, Toggle } from "@educrs/ui";
  import { EVENT } from "@educrs/core";
  import { DAILY_GOALS, settingsOf } from "@educrs/gamification";
  import { localTz, openProgress, type Progress } from "../lib/progress.ts";
  import { download, exportFile } from "../lib/export.ts";

  let progress = $state<Progress | null>(null);
  let goal = $state<number | null>(null);
  let plainMode = $state(false);
  let status = $state("");

  onMount(() => {
    let cancelled = false;
    openProgress().then((p) => {
      if (cancelled) return;
      const s = settingsOf(p.events());
      goal = s.dailyGoal;
      plainMode = s.plainMode;
      progress = p;
    });
    return () => { cancelled = true; };
  });

  async function save(change: Record<string, unknown>) {
    status = "";
    await progress?.record(EVENT.settingsChanged, change);
    status = t("settings.saved");
  }

  function downloadData() {
    if (!progress) return;
    download(exportFile(progress.events(), { device: progress.device, now: Date.now(), tz: localTz() }));
  }
</script>

<div data-testid="settings" data-ready={progress !== null}>
  {#if !progress}
    <p class="mt-6 text-muted">{t("settings.loading")}</p>
  {:else}
    {#if !progress.persistent}
      <p class="mt-6 rounded-md border-2 border-border bg-surface p-3" role="note" data-testid="not-persistent">{t("settings.notPersistent")}</p>
    {/if}

    <section class="mt-8 grid gap-3" aria-labelledby="goal-title">
      <h2 id="goal-title" class="text-xl font-semibold">{t("settings.goal.title")}</h2>
      <p class="text-muted">{t("settings.goal.help")}</p>
      <GoalPicker goals={DAILY_GOALS} bind:selected={goal} name="daily-goal" legend={t("settings.goal.title")} onchange={(g) => save({ dailyGoal: g })} />
      <p class="text-sm text-muted">{t("settings.goal.later")} {t("settings.freezes.help")}</p>
    </section>

    <section class="mt-10 grid gap-3" aria-labelledby="plain-title">
      <h2 id="plain-title" class="text-xl font-semibold">{t("settings.plain.title")}</h2>
      <Toggle id="plain-mode" label={t("settings.plain.label")} description={t("settings.plain.help")} bind:checked={plainMode} onchange={(on) => save({ plainMode: on })} />
    </section>

    <section class="mt-10 grid gap-3" aria-labelledby="data-title">
      <h2 id="data-title" class="text-xl font-semibold">{t("settings.data.title")}</h2>
      <p class="text-muted">{t("settings.data.help")}</p>
      <button type="button" class="min-h-11 justify-self-start rounded-md border-2 border-accent px-5 font-semibold text-accent" onclick={downloadData} data-testid="download-data">
        {t("settings.data.download")}
      </button>
    </section>
  {/if}
  <p class="mt-6 min-h-6 text-sm" role="status" data-testid="settings-status">{status}</p>
</div>
