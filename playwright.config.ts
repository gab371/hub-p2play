import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the P2Play Hub smoke tests.
 *
 * These tests verify the hub can launch each game and that at least one round
 * is playable. They are wired into the deploy workflow as a gate: if any test
 * fails, the deploy job is skipped.
 *
 * The tests need the hub served on http://localhost:3004 with the production
 * game bundles already present under public/games/. In CI the workflow runs
 * `node download-games.js` first; locally Playwright reuses an already-running
 * dev server (or starts one on port 3004).
 */
const BASE_URL = "http://localhost:3004";
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 2 : 0,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 120_000,
  expect: { timeout: 20_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1280, height: 900 },
    // Slow down actions in local headed runs so the browser is watchable.
    // No effect in CI (where tests run headless).
    launchOptions: { slowMo: isCI ? 0 : 250 },
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: isCI
    ? {
        command: "npx vite --port 3004 --strictPort",
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : {
        command: "npx vite --port 3004 --strictPort",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
