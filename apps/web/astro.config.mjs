import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  site: "https://python.educrs.com",
  output: "static",
  integrations: [svelte()],
  build: { inlineStylesheets: "never" },
  vite: {
    plugins: [tailwindcss()],
    // Never inline fonts as data: URIs: the CSP allows fonts only from 'self' (no data:), and Chrome
    // decodes inlined font faces eagerly, so a tiny inlined subset was a CSP violation on every page
    // (docs/05-f3-mvp0.md §17.9). Other assets keep Vite's default.
    build: { assetsInlineLimit: (file) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined) },
  },
});
