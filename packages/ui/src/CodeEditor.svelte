<script lang="ts">
  // Python editor (docs/05-f3-mvp0.md §5). A plain <textarea> works immediately; CodeMirror is
  // loaded lazily and replaces it when ready, carrying over whatever was typed.
  import { onMount } from "svelte";
  import { t } from "@educrs/i18n";
  import type { EditorHandle } from "./codemirror-setup.ts";
  import SymbolBar from "./SymbolBar.svelte";

  interface Props {
    value?: string;
    label: string;
    id?: string;
    errorLine?: number | null;
    readonly?: boolean;
    /** "auto" shows the symbol bar on touch devices only. */
    symbolBar?: "auto" | "always" | "never";
    /** false keeps the plain textarea (no-JS-like fallback; used in Storybook and tests). */
    enhance?: boolean;
    /** Fill the container's height and scroll inside it (full-screen mode) instead of growing. */
    fill?: boolean;
    onRun?: () => void;
  }
  let {
    value = $bindable(""),
    label,
    id = "code",
    errorLine = null,
    readonly = false,
    symbolBar = "auto",
    enhance = true,
    fill = false,
    onRun,
  }: Props = $props();

  let host = $state<HTMLDivElement>();
  let fallback = $state<HTMLTextAreaElement>();
  let editor = $state<EditorHandle | null>(null);
  let coarse = $state(false);
  const showBar = $derived(!readonly && (symbolBar === "always" || (symbolBar === "auto" && coarse)));
  // One row per line, like the editor that replaces it: the same height, so nothing moves.
  const rows = $derived(value.split("\n").length);

  onMount(() => {
    coarse = window.matchMedia("(pointer: coarse)").matches;
    if (!enhance) return;
    let cancelled = false;
    let handle: EditorHandle | null = null;
    import("./codemirror-setup.ts").then(({ createEditor }) => {
      if (cancelled || !host) return;
      const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
      const mount = document.createElement("div");
      mount.style.height = "100%"; // lets `fill` reach the editor; nothing without a sized host
      root.append(mount);
      handle = createEditor({
        parent: mount,
        root,
        doc: value,
        label,
        placeholder: readonly ? "" : t("editor.placeholder"),
        readonly,
        onChange: (v) => { value = v; },
        onRun: () => onRun?.(),
      });
      editor = handle;
    });
    return () => {
      cancelled = true;
      handle?.destroy();
    };
  });

  $effect(() => {
    editor?.setErrorLine(errorLine ?? null);
  });

  $effect(() => {
    // external changes (e.g. a "reset" button) flow into CodeMirror
    if (editor && editor.getValue() !== value) editor.setValue(value);
  });

  /** Put the cursor in the editor (or in the textarea before the editor has loaded). */
  export function focus() {
    if (editor) editor.focus();
    else fallback?.focus();
  }

  function insert(text: string, back: number) {
    if (editor) { editor.insert(text, back); return; }
    const ta = fallback;
    if (!ta) return;
    const start = ta.selectionStart;
    value = value.slice(0, start) + text + value.slice(ta.selectionEnd);
    queueMicrotask(() => {
      ta.selectionStart = ta.selectionEnd = start + text.length - back;
      ta.focus();
    });
  }

  function move(delta: number) {
    if (editor) { editor.moveCursor(delta); return; }
    const ta = fallback;
    if (!ta) return;
    const pos = Math.max(0, Math.min(value.length, ta.selectionStart + delta));
    ta.selectionStart = ta.selectionEnd = pos;
    ta.focus();
  }

  function onFallbackKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      onRun?.();
    }
  }
</script>

<div class="editor" class:fill data-testid="code-editor" data-ready={editor !== null}>
  {#if editor === null}
    <label class="sr-only" for={id}>{label}</label>
    <textarea
      {id}
      bind:this={fallback}
      bind:value
      {rows}
      {readonly}
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      placeholder={readonly ? undefined : t("editor.placeholder")}
      onkeydown={onFallbackKeydown}
      aria-describedby={enhance ? `${id}-loading` : undefined}
    ></textarea>
    {#if enhance}<span class="sr-only" id={`${id}-loading`}>{t("editor.loading")}</span>{/if}
  {/if}
  <div bind:this={host} class="host" class:hidden={editor === null}></div>
  {#if showBar}
    <SymbolBar oninsert={insert} onmove={move} />
  {/if}
</div>

<style>
  /* The same box as the editor that takes its place (codemirror-setup.ts): 9rem of content at
     least, 8px above and below, a 1px border, 24px a line — the swap must not move the page. */
  textarea {
    display: block; /* inline-block would leave a text baseline's gap under it */
    box-sizing: border-box;
    width: 100%;
    min-height: calc(9rem + 2px);
    resize: vertical;
    padding: var(--space-2) var(--space-3);
    font: 16px/1.5 var(--font-mono); /* 16px: no iOS focus zoom */
    color: var(--color-text);
    background: var(--color-code-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    caret-color: var(--color-text);
  }
  textarea::placeholder {
    color: var(--color-text-muted);
    font-family: var(--font-sans);
    opacity: 1; /* Firefox dims placeholders by default */
  }
  /* Full-screen mode: the editor takes the height it is given and its content scrolls inside. */
  .fill {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .fill .host,
  .fill textarea {
    flex: 1;
    min-height: 0;
  }
  .fill textarea {
    resize: none;
  }
  textarea:focus-visible {
    outline: 3px solid var(--color-focus);
    outline-offset: 2px;
  }
  .hidden {
    display: none;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
