/**
 * The Markdown subset our content uses, parsed into a tree that Svelte renders as elements.
 * No HTML strings and no {@html}: anything we do not understand stays literal text, so content
 * can never inject markup (XSS-safe by construction).
 *
 * Supported:
 *   blocks  — paragraphs (blank line between), ``` fenced code ```, 4-space indented code
 *   inline  — `code`, **strong**, *emphasis*
 */

export type Inline =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "strong"; readonly children: readonly Inline[] }
  | { readonly kind: "em"; readonly children: readonly Inline[] };

export type Block =
  | { readonly kind: "p"; readonly children: readonly Inline[] }
  | { readonly kind: "code"; readonly lang: string | null; readonly text: string };

const FENCE = /^```\s*([\w-]*)\s*$/;
const INDENTED = /^( {4}|\t)/;

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "p", children: parseInline(para.join(" ")) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    const fence = FENCE.exec(line);
    if (fence) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && !FENCE.test(lines[i] as string)) body.push(lines[i++] as string);
      blocks.push({ kind: "code", lang: fence[1] || null, text: body.join("\n") });
      continue;
    }
    if (INDENTED.test(line) && para.length === 0) {
      const body: string[] = [];
      while (i < lines.length && (INDENTED.test(lines[i] as string) || ((lines[i] as string).trim() === "" && INDENTED.test(lines[i + 1] ?? "")))) {
        body.push((lines[i] as string).replace(INDENTED, ""));
        i++;
      }
      i--;
      blocks.push({ kind: "code", lang: null, text: body.join("\n") });
      continue;
    }
    if (line.trim() === "") flush();
    else para.push(line.trim());
  }
  flush();
  return blocks;
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const push = (node: Inline) => {
    if (text) out.push({ kind: "text", text });
    text = "";
    out.push(node);
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i] as string;
    if (ch === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i + 1) { push({ kind: "code", text: src.slice(i + 1, end) }); i = end + 1; continue; }
    } else if (src.startsWith("**", i)) {
      const end = src.indexOf("**", i + 2);
      if (end > i + 2) { push({ kind: "strong", children: parseInline(src.slice(i + 2, end)) }); i = end + 2; continue; }
    } else if (ch === "*") {
      const end = src.indexOf("*", i + 1);
      if (end > i + 1 && src[i + 1] !== " ") { push({ kind: "em", children: parseInline(src.slice(i + 1, end)) }); i = end + 1; continue; }
    }
    text += ch;
    i++;
  }
  if (text) out.push({ kind: "text", text });
  return out;
}
