import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { createRawSnippet } from "svelte";
import Button from "./Button.svelte";

// The one button (direction A, docs/05-f3-mvp0.md §17.6). Every variant is axe-scanned in all three
// themes (tools/storybook-a11y.mjs).

const label = (text: string) => createRawSnippet(() => ({ render: () => `<span>${text}</span>` }));

export default { title: "Button" } satisfies Meta;

const story = (name: string, args: Record<string, unknown>, text: string): StoryObj<typeof Button> => ({
  name,
  render: (a) => ({ Component: Button, props: { ...a, children: label(text) } }),
  args,
});

export const Primary = story("Primary", { variant: "primary" }, "Continue");
export const Secondary = story("Secondary", { variant: "secondary" }, "Show me");
export const Correct = story("Tone: correct", { variant: "correct" }, "Continue");
export const Mixup = story("Tone: common mix-up", { variant: "mixup" }, "Try again");
export const Wrong = story("Tone: wrong", { variant: "wrong" }, "Try again");
export const Link = story("As a link", { variant: "primary", href: "#" }, "Next lesson");
export const Wide = story("Wide", { variant: "primary", wide: true }, "Continue");
export const Disabled = story("Disabled", { variant: "primary", disabled: true }, "Check");
