import type { Meta, StoryObj } from "@storybook/svelte-vite";
import LearningPath from "./LearningPath.svelte";
import type { PathNodeView } from "./types.ts";

const node = (n: number, state: PathNodeView["state"], inProgress = false): PathNodeView => ({
  lessonId: `lesson:l${n}`, title: ["Using variables", "Giving a variable a new value", "Naming rules", "NameError", "Tracing program state"][n] ?? `Lesson ${n}`,
  href: "#", state, inProgress,
});

const meta = { title: "Path/LearningPath", component: LearningPath } satisfies Meta<typeof LearningPath>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Fresh: Story = {
  name: "Nothing done yet",
  args: { modules: [{ id: "M2", title: "Variables", nodes: [node(0, "next"), node(1, "todo"), node(2, "todo"), node(3, "todo")] }] },
};
export const Midway: Story = {
  name: "Some done, one in progress",
  args: { modules: [{ id: "M2", title: "Variables", nodes: [node(0, "completed"), node(1, "completed"), node(2, "next", true), node(3, "todo"), node(4, "todo")] }] },
};
