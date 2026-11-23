/** WCAG 2.x relative luminance and contrast ratio. */

export function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`expected #rrggbb, got ${hex}`);
  const n = Number.parseInt(m[1] as string, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Pairs that must stay readable in every theme: [foreground, background, minimum ratio]. */
export const REQUIRED_PAIRS: ReadonlyArray<readonly [string, string, number]> = [
  ["--color-text", "--color-bg", 4.5],
  ["--color-text", "--color-surface", 4.5],
  ["--color-text", "--color-code-bg", 4.5],
  ["--color-text-muted", "--color-bg", 4.5],
  ["--color-text-muted", "--color-surface", 4.5],
  ["--color-accent", "--color-bg", 4.5],
  ["--color-accent", "--color-surface", 4.5],
  ["--color-on-accent", "--color-accent", 4.5],
  ["--color-success", "--color-surface", 4.5],
  ["--color-danger", "--color-surface", 4.5],
  ["--color-xp", "--color-surface", 4.5],
  ["--color-streak", "--color-surface", 4.5],
  // the stats bar sits on the page background (docs/05-f3-mvp0.md §15.7)
  ["--color-xp", "--color-bg", 4.5],
  ["--color-streak", "--color-bg", 4.5],
  ["--color-success", "--color-bg", 3],
  // syntax highlighting must stay readable on the editor background
  ["--color-code-keyword", "--color-code-bg", 4.5],
  ["--color-code-string", "--color-code-bg", 4.5],
  ["--color-code-comment", "--color-code-bg", 4.5],
  ["--color-code-number", "--color-code-bg", 4.5],
  ["--color-code-function", "--color-code-bg", 4.5],
  ["--color-text", "--color-code-error-line", 4.5],
  ["--color-code-string", "--color-code-error-line", 4.5],
  // lesson feedback panel (docs/05-f3-mvp0.md §13.3): body text and the tone-coloured title
  ["--color-warning", "--color-surface", 4.5],
  ["--color-text", "--color-success-soft", 4.5],
  ["--color-text", "--color-warning-soft", 4.5],
  ["--color-text", "--color-danger-soft", 4.5],
  ["--color-success", "--color-success-soft", 4.5],
  ["--color-warning", "--color-warning-soft", 4.5],
  ["--color-danger", "--color-danger-soft", 4.5],
  // non-text UI (borders, focus rings): WCAG 1.4.11 asks for 3:1
  ["--color-border", "--color-bg", 3],
  ["--color-border", "--color-surface", 3],
  ["--color-focus", "--color-bg", 3],
  // visual direction A (docs/05-f3-mvp0.md §17.6): selected tiles, reward chips, the mix-up button, the flame
  ["--color-text", "--color-accent-soft", 4.5],
  ["--color-accent", "--color-accent-soft", 4.5],
  ["--color-xp", "--color-xp-soft", 4.5],
  ["--color-streak", "--color-streak-soft", 4.5],
  ["--color-on-warning-strong", "--color-warning-strong", 4.5],
  // tone buttons in the feedback panel: Continue (correct) and Try again (wrong) carry on-accent text
  ["--color-on-accent", "--color-success", 4.5],
  ["--color-on-accent", "--color-danger", 4.5],
  ["--color-streak-fill", "--color-bg", 3],
];
