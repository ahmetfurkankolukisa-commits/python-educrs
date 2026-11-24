<script lang="ts">
  // Settings (docs/05-f3-mvp0.md §15.3, §15.5, §15.6): daily goal, plain mode, download my data.
  // Settings are events like everything else, so they will sync later; nothing leaves the device.
  import { onMount } from "svelte";
  import { t } from "@educrs/i18n";
  import { Button, GoalPicker, ThemePicker, Toggle } from "@educrs/ui";
  import { EVENT } from "@educrs/core";
  import { DAILY_GOALS, THEMES, settingsOf, type Theme } from "@educrs/gamification";
  import { applyTheme } from "../lib/theme.ts";
  import { localTz, openProgress, type Progress } from "../lib/progress.ts";
  import { download, exportFile } from "../lib/export.ts";

  let progress = $state<Progress | null>(null);
  let goal = $state<number | null>(null);
  let plainMode = $state(false);
  let theme = $state<Theme>("system");
  let status = $state("");

  onMount(() => {
    let cancelled = false;
    openProgress().then((p) => {
      if (cancelled) return;
      const s = settingsOf(p.events());
      goal = s.dailyGoal;
      plainMode = s.plainMode;
      theme = s.theme;
      progress = p;
    });
    return () => { cancelled = true; };
  });

  // "Saved." appears as a small toast near the bottom, where the thumb is, then fades (§17.7).
  // The live region keeps its text a while longer so screen readers hear it.
  let shown = $state(false);
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  async function save(change: Record<string, unknown>) {
    status = "";
    await progress?.record(EVENT.settingsChanged, change);
    status = t("settings.saved");
    shown = true;
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { shown = false; }, 2500);
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
      <p class="note" role="note" data-testid="not-persistent">{t("settings.notPersistent")}</p>
    {/if}

    <section class="card" aria-labelledby="goal-title">
      <h2 id="goal-title"><span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="0.5" /></svg></span>{t("settings.goal.title")}</h2>
      <p class="text-muted">{t("settings.goal.help")}</p>
      <GoalPicker goals={DAILY_GOALS} bind:selected={goal} name="daily-goal" legend={t("settings.goal.title")} onchange={(g) => save({ dailyGoal: g })} />
      <p class="text-sm text-muted">{t("settings.goal.later")} {t("settings.freezes.help")}</p>
    </section>

    <section class="card" aria-labelledby="plain-title">
      <h2 id="plain-title"><span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg></span>{t("settings.plain.title")}</h2>
      <!-- Applied at once, then stored: the page must not wait for the write to change colour. -->
      <ThemePicker themes={THEMES} bind:selected={theme} name="theme" legend={t("settings.theme.title")} onchange={(v) => { applyTheme(v); void save({ theme: v }); }} />
      <p class="text-sm text-muted">{t("settings.theme.help")}</p>
      <Toggle id="plain-mode" label={t("settings.plain.label")} description={t("settings.plain.help")} bind:checked={plainMode} onchange={(on) => save({ plainMode: on })} />
    </section>

    <section class="card" aria-labelledby="data-title">
      <h2 id="data-title"><span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg></span>{t("settings.data.title")}</h2>
      <p class="text-muted">{t("settings.data.help")}</p>
      <div><Button variant="secondary" onclick={downloadData} data-testid="download-data">{t("settings.data.download")}</Button></div>
    </section>
  {/if}
  <p class="toast" class:shown role="status" data-testid="settings-status">{status}</p>
</div>

<style>
  .card {
    display: grid;
    gap: var(--space-3);
    margin-top: var(--space-6);
    padding: var(--space-6);
    border: 2px solid var(--color-border-soft);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }
  .card h2 {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin: 0;
    font-size: var(--text-xl);
    font-weight: 700; /* stated: the reset makes headings inherit, and "Plain mode" under it is 600 */
  }
  .card p {
    margin: 0;
  }
  .icon {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: var(--radius-sm);
    background: var(--color-accent-soft);
    color: var(--color-accent);
  }
  .icon svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .note {
    margin: var(--space-6) 0 0;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--color-warning-soft);
  }
  .toast {
    position: fixed;
    left: 50%;
    bottom: calc(var(--space-6) + env(safe-area-inset-bottom));
    z-index: 3;
    margin: 0;
    padding: var(--space-2) var(--space-4);
    border-radius: 999px;
    background: var(--color-text);
    color: var(--color-bg);
    font-weight: 700;
    opacity: 0;
    pointer-events: none;
    transform: translate(-50%, 8px);
    transition: opacity var(--motion-base) var(--ease-out), transform var(--motion-base) var(--ease-out);
  }
  .toast.shown {
    opacity: 1;
    transform: translate(-50%, 0);
  }
</style>
