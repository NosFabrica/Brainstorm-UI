import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: "../playwright-report" }]] : "list",
  outputDir: "../test-results",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "https://brainstorm-staging.nosfabrica.com",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
