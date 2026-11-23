import type { Meta, StoryObj } from "@storybook/svelte-vite";
import { createRawSnippet } from "svelte";
import ChoiceList from "./ChoiceList.svelte";
import CodeBlock from "./CodeBlock.svelte";
import FeedbackPanel from "./FeedbackPanel.svelte";
import GapFill from "./GapFill.svelte";
import HintLadder from "./HintLadder.svelte";
import LessonComplete from "./LessonComplete.svelte";
import LessonHeader from "./LessonHeader.svelte";
import Markdown from "./Markdown.svelte";

// Lesson building blocks (docs/05-f3-mvp0.md §13). Every state a learner can see has a story,
// and every story is axe-scanned in all three themes (tools/storybook-a11y.mjs).

const body = (html: string) => createRawSnippet(() => ({ render: () => `<div>${html}</div>` }));
const noop = () => {};

export default { title: "Lesson" } satisfies Meta;

export const Header: StoryObj<typeof LessonHeader> = {
  render: (args) => ({ Component: LessonHeader, props: args }),
  args: { done: 2, total: 5, exitHref: "#" },
};

export const Prose: StoryObj<typeof Markdown> = {
  name: "Markdown (prompt)",
  render: (args) => ({ Component: Markdown, props: args }),
  args: { text: 'The program starts with a variable called `name`. Make it print `Hello,` followed by the name.\n\nFor example, when `name = "Ada"` the program prints:\n\n    Hello, Ada\n\nYour program must work for **any** name.' },
};

export const Code: StoryObj<typeof CodeBlock> = {
  name: "Code block with output",
  render: (args) => ({ Component: CodeBlock, props: args }),
  args: { code: 'name = "Ada"\nprint(name)\nprint("name")', label: "Example", output: "Ada\nname\n" },
};

export const CodeLabelled: StoryObj<typeof CodeBlock> = {
  name: "Code block with a visible label (Show me)",
  render: (args) => ({ Component: CodeBlock, props: args }),
  args: { code: 'name = "Ada"', label: "Solution so far", showLabel: true },
};

const options = ["Ada Lovelace", "first last", "AdaLovelace", "Error"];
export const Choices: StoryObj<typeof ChoiceList> = {
  name: "Choices (nothing picked)",
  render: (args) => ({ Component: ChoiceList, props: args }),
  args: { options, name: "q1", legend: "Answers", selected: null },
};
export const ChoicesPicked: StoryObj<typeof ChoiceList> = {
  name: "Choices (picked)",
  render: (args) => ({ Component: ChoiceList, props: args }),
  args: { options, name: "q2", legend: "Answers", selected: "first last" },
};
export const ChoicesRevealed: StoryObj<typeof ChoiceList> = {
  name: "Choices (answer shown)",
  render: (args) => ({ Component: ChoiceList, props: args }),
  args: { options, name: "q3", legend: "Answers", selected: null, highlight: "Ada Lovelace" },
};

const gap = { template: 'name = "Ada"\nprint("Hello,", ____)', tiles: ["name", '"name"', "Name"] };
export const Gap: StoryObj<typeof GapFill> = {
  name: "Fill the gap (empty)",
  render: (args) => ({ Component: GapFill, props: args }),
  args: { ...gap, name: "g1", selected: null },
};
export const GapFilled: StoryObj<typeof GapFill> = {
  name: "Fill the gap (filled)",
  render: (args) => ({ Component: GapFill, props: args }),
  args: { ...gap, name: "g2", selected: '"name"' },
};

const hints = ["The name is already stored in the variable `name`.", "`print` can show several values: `print(\"Hello,\", name)`."];
export const Hints: StoryObj<typeof HintLadder> = {
  name: "Hints (none shown)",
  render: (args) => ({ Component: HintLadder, props: args }),
  args: { hints, shown: 0, onmore: noop },
};
export const HintsShown: StoryObj<typeof HintLadder> = {
  name: "Hints (one shown)",
  render: (args) => ({ Component: HintLadder, props: args }),
  args: { hints, shown: 1, onmore: noop },
};

// Byte stands on the sheet's top edge with the mood the app gives each tone (§17.11); the last
// story is the sheet as plain mode shows it.
const MOOD = { correct: "happy", mixup: "thinking", wrong: "oops", unavailable: "thinking" } as const;
const panel = (tone: "correct" | "mixup" | "wrong" | "unavailable", title: string, html: string, secondary = false, byte = true): StoryObj<typeof FeedbackPanel> => ({
  render: (args) => ({ Component: FeedbackPanel, props: args }),
  args: {
    tone, title, autofocus: false, children: body(html), mascot: byte ? MOOD[tone] : null,
    primary: { label: tone === "correct" ? "Continue" : "Try again", onclick: noop },
    secondary: secondary ? { label: "Show me", onclick: noop } : null,
  },
});
export const Correct = { ...panel("correct", "Correct!", "<p>Without quotes, Python uses the value stored in the variable.</p>"), name: "Feedback: correct" };
export const Mixup = { ...panel("mixup", "Common mix-up", "<p>With quotes, Python prints the word name itself.</p>"), name: "Feedback: common mix-up" };
export const Wrong = { ...panel("wrong", "Not quite", "<p>Your program runs, but its output is different.</p>", true), name: "Feedback: wrong (Show me available)" };
export const Unavailable = { ...panel("unavailable", "Couldn't check", "<p>Python didn't answer in time.</p>"), name: "Feedback: check unavailable" };
export const CorrectPlain = { ...panel("correct", "Correct!", "<p>Without quotes, Python uses the value stored in the variable.</p>", false, false), name: "Feedback: plain mode (no Byte)" };

export const Complete: StoryObj<typeof LessonComplete> = {
  name: "Lesson complete",
  render: (args) => ({ Component: LessonComplete, props: args }),
  args: { lessonTitle: "Using variables", exercises: 4, firstTry: 3, nextHref: "#", pathHref: "#" },
};
export const CompleteLast: StoryObj<typeof LessonComplete> = {
  name: "Lesson complete (last lesson)",
  render: (args) => ({ Component: LessonComplete, props: args }),
  args: { lessonTitle: "Giving a variable a new value", exercises: 3, firstTry: 0, nextHref: null, pathHref: "#" },
};
export const CompleteRewards: StoryObj<typeof LessonComplete> = {
  name: "Lesson complete (XP, goal reached now, streak)",
  render: (args) => ({ Component: LessonComplete, props: args }),
  args: {
    lessonTitle: "Using variables", exercises: 4, firstTry: 2, nextHref: "#", pathHref: "#",
    rewards: { xp: 45, todayXp: 45, goal: 20, goalReachedNow: true, streak: 3 },
  },
};
export const CompleteGoalNotYet: StoryObj<typeof LessonComplete> = {
  name: "Lesson complete (goal not reached yet, no streak)",
  render: (args) => ({ Component: LessonComplete, props: args }),
  args: {
    lessonTitle: "Giving a variable a new value", exercises: 3, firstTry: 1, nextHref: null, pathHref: "#",
    rewards: { xp: 18, todayXp: 18, goal: 30, goalReachedNow: false, streak: 0 },
  },
};
export const CompletePlain: StoryObj<typeof LessonComplete> = {
  name: "Lesson complete (plain mode)",
  render: (args) => ({ Component: LessonComplete, props: args }),
  args: {
    lessonTitle: "Using variables", exercises: 4, firstTry: 2, nextHref: "#", pathHref: "#", plain: true,
    rewards: { xp: 45, todayXp: 45, goal: 20, goalReachedNow: true, streak: 3 },
  },
};
export const ChoicesWrongPick: StoryObj<typeof ChoiceList> = {
  name: "Choices (after a check: wrong pick)",
  render: (args) => ({ Component: ChoiceList, props: args }),
  args: { options, name: "q4", legend: "Answers", selected: "AdaLovelace", disabled: true, result: "wrong" },
};
export const ChoicesMixupPick: StoryObj<typeof ChoiceList> = {
  name: "Choices (after a check: common mix-up)",
  render: (args) => ({ Component: ChoiceList, props: args }),
  args: { options, name: "q5", legend: "Answers", selected: "first last", disabled: true, result: "mixup" },
};
export const ChoicesCorrectPick: StoryObj<typeof ChoiceList> = {
  name: "Choices (after a check: correct)",
  render: (args) => ({ Component: ChoiceList, props: args }),
  args: { options, name: "q6", legend: "Answers", selected: "Ada Lovelace", disabled: true, result: "correct" },
};
export const GapMixup: StoryObj<typeof GapFill> = {
  name: "Fill the gap (after a check: common mix-up)",
  render: (args) => ({ Component: GapFill, props: args }),
  args: { ...gap, name: "g3", selected: '"name"', disabled: true, result: "mixup" },
};
