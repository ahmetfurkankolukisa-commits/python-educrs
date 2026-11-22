import type { Meta, StoryObj } from "@storybook/svelte-vite";
import SymbolBar from "./SymbolBar.svelte";

const meta = {
  title: "Editor/SymbolBar",
  component: SymbolBar,
  args: { oninsert: () => {}, onmove: () => {} },
} satisfies Meta<typeof SymbolBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
