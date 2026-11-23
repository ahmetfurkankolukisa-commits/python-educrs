import type { Meta, StoryObj } from "@storybook/svelte-vite";
import Mascot from "./Mascot.svelte";

// Byte in every mood (docs/05-f3-mvp0.md §17.11), scanned in all three themes. It is decoration
// (aria-hidden), so the scan mostly proves it adds nothing a screen reader would trip over.
const meta = { title: "Mascot/Byte", component: Mascot } satisfies Meta<typeof Mascot>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Hello: Story = { args: { mood: "hello", size: 160 } };
export const Happy: Story = { name: "Happy (correct)", args: { mood: "happy", size: 160 } };
export const Thinking: Story = { name: "Thinking (hint, mix-up)", args: { mood: "thinking", size: 160 } };
export const Oops: Story = { name: "Not yet (wrong)", args: { mood: "oops", size: 160 } };
export const Celebrate: Story = { name: "Celebrate (lesson complete)", args: { mood: "celebrate", size: 160 } };
export const Small: Story = { name: "Small and still", args: { mood: "happy", size: 48, still: true } };
