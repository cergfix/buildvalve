import { test, expect } from "@playwright/test";
import { loginAsAlice } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await loginAsAlice(page);
});

async function triggerDeployRun(page: import("@playwright/test").Page) {
  await page.goto("/project/1/pipeline/Deploy");
  await page.getByRole("button", { name: /launch pipeline/i }).click();
  await page.waitForURL(/\/run\/\d+$/);
}

test.describe("PipelineRunPage", () => {
  test("renders the run header + ref chip + jobs table", async ({ page }) => {
    await triggerDeployRun(page);
    // run #<id> header
    await expect(page.locator(".run-id .hash")).toBeVisible();
    await expect(page.locator(".chip", { hasText: "main" }).first()).toBeVisible();
    await expect(page.locator(".jobs-table tbody tr").first()).toBeVisible();
  });

  test("shows the SSE indicator while running", async ({ page }) => {
    await triggerDeployRun(page);
    // The mock pipeline takes ~15s to complete; expect 'live streaming' while it runs.
    await expect(page.locator(".sse-indicator")).toBeVisible();
  });
});

test.describe("PipelineLogsPage", () => {
  test("clicking 'view logs' opens the terminal panel with line counter", async ({ page }) => {
    await triggerDeployRun(page);
    await page.getByText(/view logs/i).first().click();
    await expect(page).toHaveURL(/\/logs$/);
    await expect(page.locator(".terminal")).toBeVisible();
    await expect(page.locator(".terminal-head .meta")).toBeVisible();
  });

  test("terminal renders log lines with line numbers", async ({ page }) => {
    await triggerDeployRun(page);
    await page.getByText(/view logs/i).first().click();
    // Wait for at least one rendered line.
    await expect(page.locator(".term-line").first()).toBeVisible();
    await expect(page.locator(".term-line .lineno").first()).toContainText(/\d{3}/);
  });
});
