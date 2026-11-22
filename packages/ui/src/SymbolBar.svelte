<script lang="ts">
  // Row of hard-to-reach characters for phone keyboards (docs/05-f3-mvp0.md §5).
  // Buttons never take focus (pointerdown is cancelled), so the keyboard stays open and the
  // cursor stays where it was.
  import { t, type MessageKey } from "@educrs/i18n";

  interface Props {
    oninsert: (text: string, back: number) => void;
    onmove: (delta: number) => void;
  }
  let { oninsert, onmove }: Props = $props();

  const keys: { label: string; text: string; back?: number; aria: MessageKey }[] = [
    { label: "Tab", text: "    ", aria: "editor.insertIndent" },
    { label: ":", text: ":", aria: "editor.insertColon" },
    { label: "( )", text: "()", back: 1, aria: "editor.insertBrackets" },
    { label: '" "', text: '""', back: 1, aria: "editor.insertQuotes" },
    { label: "' '", text: "''", back: 1, aria: "editor.insertSingleQuotes" },
    { label: "=", text: " = ", aria: "editor.insertEquals" },
    { label: ",", text: ", ", aria: "editor.insertComma" },
    { label: "#", text: "# ", aria: "editor.insertHash" },
    { label: "[ ]", text: "[]", back: 1, aria: "editor.insertSquare" },
  ];
</script>

<div class="bar" role="toolbar" aria-label={t("editor.symbols")} data-testid="symbol-bar">
  {#each keys as k (k.aria)}
    <button type="button" class="key" aria-label={t(k.aria)} onpointerdown={(e) => e.preventDefault()} onclick={() => oninsert(k.text, k.back ?? 0)}>{k.label}</button>
  {/each}
  <button type="button" class="key" aria-label={t("editor.cursorLeft")} onpointerdown={(e) => e.preventDefault()} onclick={() => onmove(-1)}>←</button>
  <button type="button" class="key" aria-label={t("editor.cursorRight")} onpointerdown={(e) => e.preventDefault()} onclick={() => onmove(1)}>→</button>
</div>

<style>
  .bar {
    display: flex;
    gap: var(--space-1);
    overflow-x: auto;
    padding: var(--space-1);
    margin-top: var(--space-2);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    scrollbar-width: none;
  }
  .key {
    flex: 0 0 auto;
    min-width: var(--target-min);
    min-height: var(--target-min);
    padding: 0 var(--space-2);
    font: 16px/1 var(--font-mono);
    color: var(--color-text);
    background: var(--color-code-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    touch-action: manipulation;
  }
  .key:active {
    background: var(--color-surface);
  }
  .key:focus-visible {
    outline: 3px solid var(--color-focus);
    outline-offset: 2px;
  }
</style>
