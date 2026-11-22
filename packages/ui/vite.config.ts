import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

// Used by Storybook (the web app compiles these components through Astro's own Svelte integration).
export default defineConfig({ plugins: [svelte()] });
