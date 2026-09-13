import { defineConfig, devices } from "@playwright/test";

// e2e/ Playwright tests are separate from server/*.test.ts (vitest, node
// environment, see vitest.config.ts) — these drive a real browser against
// a real running instance of the app. See e2e/README.md for the env vars
// a run needs and what's currently covered (just the Golden Rule's
// network-isolation guarantee for voice input so far — CLAUDE.md notes
// there's no broader client test suite yet).
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
