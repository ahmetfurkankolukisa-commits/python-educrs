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
import {
  Decoration, type DecorationSet, drawSelection, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers,
  placeholder,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

const highlight = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--color-code-keyword)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--color-code-string)" },
  { tag: tags.comment, color: "var(--color-code-comment)", fontStyle: "italic" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--color-code-number)" },
  { tag: [tags.function(tags.variableName), tags.standard(tags.variableName)], color: "var(--color-code-function)" },
]);

/** The editor's height when it holds less than that: six lines, room to see it is a place to write. */
const MIN_HEIGHT = "9rem";

// Every colour is a token. CodeMirror's own defaults come in a light and a dark set, and it picks
// by a flag on the theme, not by the page: with our token themes it stayed "light" and drew a
// BLACK cursor on the dark theme's near-black editor — no cursor at all (docs/05-f3-mvp0.md §17.15).
const theme = EditorView.theme({
  "&": {
    color: "var(--color-text)",
    backgroundColor: "var(--color-code-bg)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-md)",
    // 16px everywhere: iOS Safari zooms into editable text smaller than that (F3.2 finding).
    fontSize: "16px",
    overflow: "hidden", // the gutter and the active line keep inside the rounded corners
    // As tall as its container when that has a height (full-screen mode): the code then scrolls
    // inside the editor. In a container without a height this means nothing and the editor grows.
    height: "100%",
  },
  "&.cm-focused": { outline: "3px solid var(--color-focus)", outlineOffset: "2px" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.5", overflow: "auto" },
  // The minimum height goes on the content and the gutter (CodeMirror's own advice), so the whole
  // box is content: a click anywhere in an empty editor puts the cursor there.
  ".cm-content": { padding: "8px 0", minHeight: MIN_HEIGHT, caretColor: "var(--color-text)" },
  ".cm-gutter": { minHeight: MIN_HEIGHT },
  // drawSelection() hides the browser's caret and draws this one: 2 px, in the text colour.
  ".cm-cursor, .cm-dropCursor": { borderLeft: "2px solid var(--color-text)", marginLeft: "-1px" },
  ".cm-gutters": { backgroundColor: "var(--color-code-bg)", color: "var(--color-text-muted)", border: "none" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 12px" },
  // Where am I? The line with the cursor is tinted and its number is in the text colour.
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--color-accent) 7%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--color-text)", fontWeight: "700" },
  ".cm-line.cm-error-line": { backgroundColor: "var(--color-code-error-line)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": { backgroundColor: "color-mix(in srgb, var(--color-accent) 25%, transparent)" },
  "&.cm-focused .cm-matchingBracket, .cm-matchingBracket": { backgroundColor: "color-mix(in srgb, var(--color-accent) 22%, transparent)", outline: "1px solid var(--color-accent)" },
  "&.cm-focused .cm-nonmatchingBracket, .cm-nonmatchingBracket": { backgroundColor: "var(--color-code-error-line)" },
  ".cm-placeholder": { color: "var(--color-text-muted)", fontFamily: "var(--font-sans)" },
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
  /** Shown while the editor is empty. */
  placeholder: string;
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
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        placeholder(o.placeholder),
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
