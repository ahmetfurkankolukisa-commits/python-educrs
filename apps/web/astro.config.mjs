import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://python.educrs.com",
  output: "static",
  integrations: [svelte()],
  build: { inlineStylesheets: "never" },
  vite: { plugins: [tailwindcss()] },
});
