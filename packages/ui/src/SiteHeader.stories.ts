import type { Meta, StoryObj } from "@storybook/svelte-vite";
import SiteHeader from "./SiteHeader.svelte";

// The slim site bar (docs/05-f3-mvp0.md §17.7), scanned in all three themes.
const meta = { title: "Site/SiteHeader", component: SiteHeader } satisfies Meta<typeof SiteHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { name: "Site bar", args: { homeHref: "#", settingsHref: "#" } };
export const OnSettings: Story = { name: "Site bar (on the settings page)", args: { homeHref: "#", settingsHref: "#", current: "settings" } };
