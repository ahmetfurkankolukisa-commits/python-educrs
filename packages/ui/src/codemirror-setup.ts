/**
 * CodeMirror 6 wiring. Loaded LAZILY by CodeEditor.svelte (dynamic import), so the editor never
 * delays first paint; a plain <textarea> is shown until this module arrives.
 * Colours come from design tokens (CSS variables), so all three themes work without JS.
 *
 * The editor lives in a SHADOW ROOT: CodeMirror's style-mod then uses constructable stylesheets
 * (adoptedStyleSheets) instead of injecting <style> elements, which our strict CSP blocks. In a
 * plain document the editor silently rendered unstyled (F3.4 finding). CSS variables inherit into
 * shadow trees, so the tokens still apply.
 */
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { python } from "@codemirror/lang-python";
import { bracketMatching, HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { EditorState, StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, drawSelection, EditorView, keymap, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--color-code-keyword)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--color-code-string)" },
  { tag: tags.comment, color: "var(--color-code-comment)", fontStyle: "italic" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--color-code-number)" },
  { tag: [tags.function(tags.variableName), tags.standard(tags.variableName)], color: "var(--color-code-function)" },
]);

const theme = EditorView.theme({
  "&": {
    color: "var(--color-text)",
    backgroundColor: "var(--color-code-bg)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    // 16px everywhere: iOS Safari zooms into editable text smaller than that (F3.2 finding).
    fontSize: "16px",
    minHeight: "9rem",
  },
  "&.cm-focused": { outline: "3px solid var(--color-focus)", outlineOffset: "2px" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.5" },
  ".cm-content": { padding: "8px 0", caretColor: "var(--color-text)" },
  ".cm-gutters": { backgroundColor: "var(--color-code-bg)", color: "var(--color-text-muted)", border: "none" },
  ".cm-line.cm-error-line": { backgroundColor: "var(--color-code-error-line)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "color-mix(in srgb, var(--color-accent) 25%, transparent)" },
});

export interface EditorHandle {
  getValue(): string;
  setValue(value: string): void;
  setErrorLine(line: number | null): void;
  /** Insert at the cursor (replacing a selection); `back` moves the cursor left afterwards. */
  insert(text: string, back?: number): void;
  moveCursor(delta: number): void;
  focus(): void;
  destroy(): void;
}

export interface EditorOptions {
  parent: HTMLElement;
  root: ShadowRoot;
  doc: string;
  label: string;
  readonly: boolean;
  onChange(value: string): void;
  onRun(): void;
}

export function createEditor(o: EditorOptions): EditorHandle {
  const setError = StateEffect.define<number | null>();
  const errorLine = StateField.define<DecorationSet>({
    create: () => Decoration.none,
    update(deco, tr) {
      for (const e of tr.effects) {
        if (!e.is(setError)) continue;
        const n = e.value;
        if (n === null || n < 1 || n > tr.state.doc.lines) return Decoration.none;
        return Decoration.set([Decoration.line({ class: "cm-error-line" }).range(tr.state.doc.line(n).from)]);
      }
      return tr.docChanged ? Decoration.none : deco; // editing clears the stale highlight
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  const view = new EditorView({
    parent: o.parent,
    root: o.root,
    state: EditorState.create({
      doc: o.doc,
      extensions: [
        lineNumbers(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        indentUnit.of("    "),
        python(),
        syntaxHighlighting(highlight),
        theme,
        // Wrap long lines: no sideways scrolling on phones, and no keyboard-unreachable scroll
        // region (axe scrollable-region-focusable, F3.4 finding).
        EditorView.lineWrapping,
        errorLine,
        EditorState.readOnly.of(o.readonly),
        EditorView.contentAttributes.of({ "aria-label": o.label, autocapitalize: "off", autocorrect: "off", spellcheck: "false" }),
        keymap.of([
          { key: "Mod-Enter", run: () => { o.onRun(); return true; } },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab, // Esc then Tab leaves the editor (CodeMirror's keyboard-trap escape)
        ]),
        EditorView.updateListener.of((u) => { if (u.docChanged) o.onChange(u.state.doc.toString()); }),
      ],
    }),
  });

  return {
    getValue: () => view.state.doc.toString(),
    setValue(value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    },
    setErrorLine(line) {
      view.dispatch({ effects: setError.of(line) });
    },
    insert(text, back = 0) {
      const { from, to } = view.state.selection.main;
      view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length - back }, userEvent: "input.symbolbar" });
      view.focus();
    },
    moveCursor(delta) {
      const head = view.state.selection.main.head;
      const anchor = Math.max(0, Math.min(view.state.doc.length, head + delta));
      view.dispatch({ selection: { anchor } });
      view.focus();
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
