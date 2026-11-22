import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown } from "./markdown.ts";

describe("markdown subset", () => {
  it("inline code, strong and emphasis, nested", () => {
    expect(parseInline("Use `print`, *not* **`Print` or PRINT**")).toEqual([
      { kind: "text", text: "Use " },
      { kind: "code", text: "print" },
      { kind: "text", text: ", " },
      { kind: "em", children: [{ kind: "text", text: "not" }] },
      { kind: "text", text: " " },
      { kind: "strong", children: [{ kind: "code", text: "Print" }, { kind: "text", text: " or PRINT" }] },
    ]);
  });

  it("unmatched markers and HTML stay literal text (no markup injection)", () => {
    expect(parseInline("a * b ` c <script>alert(1)</script> **x")).toEqual([{ kind: "text", text: "a * b ` c <script>alert(1)</script> **x" }]);
  });

  it("paragraphs, fenced and indented code blocks", () => {
    const md = "Type this:\n\n```python\nprint(\"hi\")\n```\nIt prints:\n\n    hi\n    there\n\nDone **now**.";
    expect(parseMarkdown(md)).toEqual([
      { kind: "p", children: [{ kind: "text", text: "Type this:" }] },
      { kind: "code", lang: "python", text: 'print("hi")' },
      { kind: "p", children: [{ kind: "text", text: "It prints:" }] },
      { kind: "code", lang: null, text: "hi\nthere" },
      { kind: "p", children: [{ kind: "text", text: "Done " }, { kind: "strong", children: [{ kind: "text", text: "now" }] }, { kind: "text", text: "." }] },
    ]);
  });

  it("joins wrapped lines of one paragraph", () => {
    expect(parseMarkdown("one\ntwo\n\nthree")).toEqual([
      { kind: "p", children: [{ kind: "text", text: "one two" }] },
      { kind: "p", children: [{ kind: "text", text: "three" }] },
    ]);
  });

  it("every prompt, explanation and message in the real content parses without losing text", () => {
    const bundle = JSON.parse(readFileSync(new URL("../../../content/build/exercises.json", import.meta.url), "utf8"));
    const texts: string[] = [];
    for (const e of bundle.exercises) {
      texts.push(e.prompt, ...e.hints);
      if (e.predict) texts.push(e.predict.explanation, ...Object.values(e.predict.option_misconceptions).map((m: any) => m.message));
      if (e.fill) texts.push(e.fill.explanation, ...Object.values(e.fill.tile_misconceptions).map((m: any) => m.message));
      for (const m of e.misconceptions ?? []) texts.push(m.message);
    }
    for (const l of bundle.lessons) for (const s of l.steps) if (s.text) texts.push(s.text);
    const flat = (nodes: any[]): string => nodes.map((n) => (n.children ? flat(n.children) : n.text)).join("");
    for (const t of texts) {
      const blocks = parseMarkdown(t);
      const words = (s: string) => s.replace(/[`*\s]/g, "");
      const rendered = blocks.map((b) => (b.kind === "p" ? flat(b.children as any[]) : b.text)).join("");
      expect(words(rendered), t).toBe(words(t.replace(/```\w*/g, "")));
    }
  });
});
