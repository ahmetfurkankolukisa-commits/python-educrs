import type { Meta, StoryObj } from "@storybook/svelte-vite";
import CodeEditor from "./CodeEditor.svelte";

const meta = {
  title: "Editor/CodeEditor",
  component: CodeEditor,
  args: { label: "Python code", value: 'name = "Ada"\nprint("Hello,", name)' },
} satisfies Meta<typeof CodeEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { value: "" } };
export const ErrorLine: Story = { name: "Error on a line", args: { value: 'name = "Ada"\nprint(nmae)', errorLine: 2 } };
export const ReadOnly: Story = { name: "Read-only", args: { readonly: true } };
export const WithSymbolBar: Story = { name: "With symbol bar (touch devices)", args: { symbolBar: "always" } };
export const LongLine: Story = {
  name: "Long line wraps",
  args: { value: 'print("This is a long line that wraps instead of scrolling sideways on a small phone screen")' },
};
export const Fallback: Story = { name: "Before the editor loads (textarea)", args: { enhance: false } };
