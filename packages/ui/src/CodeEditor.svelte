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
    rows?: number;
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
    rows = 6,
    onRun,
  }: Props = $props();

  let host = $state<HTMLDivElement>();
  let fallback = $state<HTMLTextAreaElement>();
  let editor = $state<EditorHandle | null>(null);
  let coarse = $state(false);
  const showBar = $derived(!readonly && (symbolBar === "always" || (symbolBar === "auto" && coarse)));

  onMount(() => {
    coarse = window.matchMedia("(pointer: coarse)").matches;
    if (!enhance) return;
    let cancelled = false;
    let handle: EditorHandle | null = null;
    import("./codemirror-setup.ts").then(({ createEditor }) => {
      if (cancelled || !host) return;
      const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
      const mount = document.createElement("div");
      root.append(mount);
      handle = createEditor({
        parent: mount,
        root,
        doc: value,
        label,
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

<div class="editor" data-testid="code-editor" data-ready={editor !== null}>
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
      onkeydown={onFallbackKeydown}
      aria-describedby={enhance ? `${id}-loading` : undefined}
    ></textarea>
    {#if enhance}<span class="sr-only" id={`${id}-loading`}>{t("editor.loading")}</span>{/if}
  {/if}
  <div bind:this={host} class:hidden={editor === null}></div>
  {#if showBar}
    <SymbolBar oninsert={insert} onmove={move} />
  {/if}
</div>

<style>
  textarea {
    box-sizing: border-box;
    width: 100%;
    min-height: 9rem;
    resize: vertical;
    padding: var(--space-2) var(--space-3);
    font: 16px/1.5 var(--font-mono); /* 16px: no iOS focus zoom */
    color: var(--color-text);
    background: var(--color-code-bg);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
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
