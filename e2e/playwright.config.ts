import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config. Default target is http://localhost:3000 (combined image: API + SPA).
 *
 * Override via env:
 *   • BASE_URL=https://staging.buildvalve.example.com npm --workspace e2e test
 *   • SPLIT=1 BASE_URL=http://localhost:8080 API_URL=http://localhost:3000 ...   (split mode)
 *
 * In split mode the SPA is hosted on BASE_URL and `/api/*` calls go cross-origin
 * to API_URL — useful for verifying CDN-style deployments.
 */
const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
