import "../src/tokens.css";
import "./preview.css";
import type { Preview } from "@storybook/svelte-vite";

// Every story renders in all three themes (toolbar), and tools/storybook-a11y.mjs scans each one.
const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Colour theme",
      toolbar: { title: "Theme", items: ["light", "dark", "high-contrast"], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: "light" },
  decorators: [
    (story, context) => {
      document.documentElement.dataset.theme = String(context.globals.theme ?? "light");
      return story();
    },
  ],
  parameters: { a11y: { test: "error" } },
};
export default preview;
