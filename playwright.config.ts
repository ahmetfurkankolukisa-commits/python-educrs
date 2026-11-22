import { defineConfig, devices } from "@playwright/test";

// e2e runs against the BUILT sites with their real `_headers` (tools/serve-dist.mjs).
// Build first with local origins:  pnpm build:e2e
const ci = !!process.env.CI;

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  workers: 1,
  retries: ci ? 1 : 0,
  reporter: ci ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:4321", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 15"] } },
  ],
  webServer: [
    { command: "node tools/serve-dist.mjs apps/web/dist localhost 4321", url: "http://localhost:4321/", reuseExistingServer: !ci },
    { command: "node tools/serve-dist.mjs apps/run/dist 127.0.0.1 4322", url: "http://127.0.0.1:4322/build-info.json", reuseExistingServer: !ci },
    { command: "node e2e/evil-server.mjs", url: "http://127.0.0.1:4323/health", reuseExistingServer: !ci },
  ],
});
