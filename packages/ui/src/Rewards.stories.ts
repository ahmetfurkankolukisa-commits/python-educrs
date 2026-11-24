import type { Meta, StoryObj } from "@storybook/svelte-vite";
import GoalPicker from "./GoalPicker.svelte";
import GoalRing from "./GoalRing.svelte";
import StatsBar from "./StatsBar.svelte";
import ThemePicker from "./ThemePicker.svelte";
import Toggle from "./Toggle.svelte";

// Streak, XP, daily goal and settings controls (docs/05-f3-mvp0.md §15.7). Every state has a story,
// and every story is axe-scanned in all three themes (tools/storybook-a11y.mjs).

export default { title: "Rewards" } satisfies Meta;

export const StatsNew: StoryObj<typeof StatsBar> = {
  name: "Stats: a new learner",
  render: (args) => ({ Component: StatsBar, props: args }),
  args: { streak: 0, todayMet: false, freezes: 0, xp: 0, todayXp: 0, goal: 20 },
};
export const StatsGoing: StoryObj<typeof StatsBar> = {
  name: "Stats: streak going, today not reached yet",
  render: (args) => ({ Component: StatsBar, props: args }),
  args: { streak: 3, todayMet: false, freezes: 0, xp: 135, todayXp: 5, goal: 20 },
};
export const StatsReached: StoryObj<typeof StatsBar> = {
  name: "Stats: today reached, freezes",
  render: (args) => ({ Component: StatsBar, props: args }),
  args: { streak: 15, todayMet: true, freezes: 2, xp: 1240, todayXp: 35, goal: 30 },
};

export const RingEmpty: StoryObj<typeof GoalRing> = {
  name: "Goal ring: empty",
  render: (args) => ({ Component: GoalRing, props: args }),
  args: { value: 0, goal: 20, label: "Daily goal", valueText: "0 of 20 XP today" },
};
export const RingPartial: StoryObj<typeof GoalRing> = {
  name: "Goal ring: partway (large)",
  render: (args) => ({ Component: GoalRing, props: args }),
  args: { value: 12, goal: 30, label: "Daily goal", valueText: "12 of 30 XP today", size: "lg" },
};
export const RingMet: StoryObj<typeof GoalRing> = {
  name: "Goal ring: reached (large)",
  render: (args) => ({ Component: GoalRing, props: args }),
  args: { value: 45, goal: 20, label: "Daily goal", valueText: "45 of 20 XP today", size: "lg" },
};

const goals = [10, 20, 30, 50];
export const Picker: StoryObj<typeof GoalPicker> = {
  name: "Goal picker (nothing chosen, legend for screen readers)",
  render: (args) => ({ Component: GoalPicker, props: args }),
  args: { goals, name: "goal-a", legend: "Choose a daily goal", selected: null },
};
export const PickerChosen: StoryObj<typeof GoalPicker> = {
  name: "Goal picker (20 chosen, visible legend)",
  render: (args) => ({ Component: GoalPicker, props: args }),
  args: { goals, name: "goal-b", legend: "Daily goal", selected: 20, showLegend: true },
};

// Theme choice (docs/05-f3-mvp0.md §17.18): each option shows a sample of its own theme, whatever
// theme the page is in — the scan runs these in all three.
const themes = ["system", "light", "dark", "high-contrast"] as const;
export const ThemeDefault: StoryObj<typeof ThemePicker> = {
  name: "Theme picker (same as my device)",
  render: (args) => ({ Component: ThemePicker, props: args }),
  args: { themes, name: "theme-a", legend: "Theme", selected: "system" },
};
export const ThemeHighContrast: StoryObj<typeof ThemePicker> = {
  name: "Theme picker (high contrast chosen)",
  render: (args) => ({ Component: ThemePicker, props: args }),
  args: { themes, name: "theme-b", legend: "Theme", selected: "high-contrast" },
};

const plain = { label: "Plain mode", description: "Hide XP, streaks, goals and celebrations. Lessons work exactly the same, and your progress is still saved." };
export const ToggleOff: StoryObj<typeof Toggle> = {
  name: "Toggle: off",
  render: (args) => ({ Component: Toggle, props: args }),
  args: { id: "plain-a", ...plain, checked: false },
};
export const ToggleOn: StoryObj<typeof Toggle> = {
  name: "Toggle: on",
  render: (args) => ({ Component: Toggle, props: args }),
  args: { id: "plain-b", ...plain, checked: true },
};
