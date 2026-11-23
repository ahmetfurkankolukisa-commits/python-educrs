<script lang="ts">
  // Slim site bar for the home, path and settings pages (docs/05-f3-mvp0.md §17.7). Lesson pages
  // have no site bar: they are a focus mode with just × and the progress bar.
  import { t } from "@educrs/i18n";
  import Logo from "./Logo.svelte";

  interface Props {
    homeHref: string;
    settingsHref: string;
    /** Mark the settings link as the current page. */
    current?: "settings" | null;
  }
  let { homeHref, settingsHref, current = null }: Props = $props();
</script>

<header class="site">
  <a class="brand" href={homeHref}>
    <Logo size={34} />
    <span class="name">Learn Python</span>
  </a>
  <a class="settings" href={settingsHref} aria-current={current === "settings" ? "page" : undefined} data-testid="settings-link">
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
    <span>{t("nav.settings")}</span>
  </a>
</header>

<style>
  .site {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    min-height: 3.5rem;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--target-min);
    border-radius: var(--radius-sm);
    color: var(--color-text);
    text-decoration: none;
  }
  .name {
    font-size: var(--text-lg);
    font-weight: 700;
    letter-spacing: -0.01em;
  }
  .settings {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--target-min);
    padding: 0 var(--space-3);
    border-radius: 999px;
    color: var(--color-accent);
    font-weight: 600;
    text-decoration: none;
  }
  .settings:hover,
  .settings[aria-current="page"] {
    background: var(--color-accent-soft);
  }
  svg {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
