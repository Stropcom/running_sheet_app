import { defineConfig, devices } from "@playwright/test";

// e2e/ Playwright tests are separate from server/*.test.ts (vitest, node
// environment, see vitest.config.ts) — these drive a real browser against
// a real running instance of the app. See e2e/README.md for the env vars
// a run needs and what's covered.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  // One at a time: the tests share one database and a small instance.
  workers: 1,
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Optional: point at an already-installed Chromium (for example in a
    // sandbox with no download access) instead of Playwright's own copy.
    launchOptions: process.env.E2E_CHROMIUM_PATH
      ? { executablePath: process.env.E2E_CHROMIUM_PATH }
      : {},
  },
  projects: [
    // Signs in once and saves the session for everything below.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
    },
  ],
});
