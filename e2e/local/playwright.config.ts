import { defineConfig, devices } from "@playwright/test";

/**
 * The local real-stack check: the UI on vite against a brainstorm_server running
 * here. Run through `npm run e2e:local`, which starts and stops that stack — this
 * config alone expects it to be up already.
 */
export default defineConfig({
  testDir: ".",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: "list",
  outputDir: "../../test-results/local",
  use: {
    baseURL: "http://localhost:5000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Every host but this machine is unresolvable: a signup publishes a profile,
    // and a local run must not put a test account on public relays.
    launchOptions: { args: ["--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost, EXCLUDE 127.0.0.1"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
