// End-to-end tests against the production build (`npm run build` first). Run with `npm run e2e`.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 120_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure", acceptDownloads: true },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "npm run preview -- --strictPort", url: "http://localhost:4173", reuseExistingServer: !process.env.CI, cwd: ".." },
});
